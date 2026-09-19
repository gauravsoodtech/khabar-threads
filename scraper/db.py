"""All Postgres access for the scraper: psycopg 3, one connection per run, autocommit
with explicit transaction blocks where a group of writes must land together."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg

SCHEMA = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
ARTICLE_COLUMNS = ("id", "source", "title", "summary", "published_at")


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (copy .env.example to .env)")
    conn = psycopg.connect(url, connect_timeout=10, autocommit=True)
    conn.execute(SCHEMA)  # CREATE TABLE IF NOT EXISTS: safe on every run
    return conn


def known_urls(conn: psycopg.Connection, urls: list[str]) -> set[str]:
    rows = conn.execute("SELECT url FROM articles WHERE url = ANY(%s)", (urls,)).fetchall()
    return {r[0] for r in rows}


def insert_articles(conn: psycopg.Connection, articles: list[dict]) -> int:
    """The UNIQUE(url) constraint is the dedup: ON CONFLICT DO NOTHING, and rowcount says what landed."""
    inserted = 0
    with conn.transaction(), conn.cursor() as cur:
        for a in articles:
            cur.execute(
                """INSERT INTO articles (url, source, title, summary, body, published_at)
                   VALUES (%(url)s, %(source)s, %(title)s, %(summary)s, %(body)s, %(published_at)s)
                   ON CONFLICT (url) DO NOTHING""",
                a,
            )
            inserted += cur.rowcount
    return inserted


def recent_articles(conn: psycopg.Connection, days: int) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = conn.execute(
        "SELECT id, source, title, summary, published_at FROM articles "
        "WHERE published_at >= %s ORDER BY published_at",
        (since,),
    ).fetchall()
    return [dict(zip(ARTICLE_COLUMNS, r)) for r in rows]


def replace_clusters(conn: psycopg.Connection, articles: list[dict], clusters: list[dict]) -> None:
    """Rebuild every cluster inside one transaction so the API never reads a half-written state."""
    with conn.transaction():
        conn.execute("DELETE FROM clusters")  # ON DELETE SET NULL clears articles.cluster_id
        for c in clusters:
            row = conn.execute("INSERT INTO clusters (label) VALUES (%s) RETURNING id", (c["label"],)).fetchone()
            ids = [articles[m]["id"] for m in c["members"]]
            conn.execute("UPDATE articles SET cluster_id = %s WHERE id = ANY(%s)", (row[0], ids))
