"""Entry point. Run from the repo root:  python -m scraper.run [options]

  (no flags)       pull the feeds, fetch full text for NEW articles only, store them, rebuild clusters
  --cluster-only   skip the feeds and just re-cluster what is already in the database
  --dry-run        print the clusters but write nothing (pair with --min-shared to tune the threshold)
  --from-feeds     dry-run on today's live feed items with no database at all

Progress goes to stderr. The last line on stdout is a JSON summary that the Node API
stores on the ingest job.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .cluster import cluster
from .feeds import pull_all
from .fulltext import fetch_bodies


def load_dotenv() -> None:
    """Tiny .env reader (repo root) so local runs need no exported variables. Real env wins."""
    path = Path(__file__).resolve().parent.parent / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# Headlines carry curly quotes and accents; a Windows console default of cp1252 would crash on them.
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")


def report(articles: list[dict], clusters: list[dict]) -> None:
    for n, c in enumerate(clusters, 1):
        log(f"[{n}] {c['label']}  ({len(c['members'])} articles)")
        for m in sorted(c["members"], key=lambda m: articles[m]["published_at"]):
            a = articles[m]
            log(f"      {a['source']:<10} {a['published_at']:%d %b %H:%M}  {a['title']}")
    clustered = sum(len(c["members"]) for c in clusters)
    largest = max((len(c["members"]) for c in clusters), default=0)
    log(f"{len(clusters)} clusters, largest {largest}, {len(articles) - clustered} of {len(articles)} articles unclustered")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--days", type=int, default=3, help="cluster articles published in the last N days (default 3)")
    p.add_argument("--min-shared", type=int, default=3, help="shared meaningful words that link two articles (default 3)")
    p.add_argument("--max-per-feed", type=int, default=25, help="newest items to take from each feed (default 25)")
    p.add_argument("--cluster-only", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--from-feeds", action="store_true")
    args = p.parse_args(argv)
    load_dotenv()
    summary: dict = {"started_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}

    if args.from_feeds:
        articles, _ = pull_all(args.max_per_feed, log)
        report(articles, cluster(articles, args.min_shared))
        return

    conn = db.connect()
    if not args.cluster_only:
        articles, summary["feeds"] = pull_all(args.max_per_feed, log)
        seen = db.known_urls(conn, [a["url"] for a in articles])
        new = [a for a in articles if a["url"] not in seen]  # only fetch pages we have never stored
        log(f"{len(articles)} feed items, {len(new)} new")
        bodies = fetch_bodies([a["url"] for a in new])
        for a in new:
            a["body"] = bodies.get(a["url"])
        summary["new_articles"] = db.insert_articles(conn, new)
        summary["bodies_extracted"] = sum(1 for a in new if a["body"])
        log(f"stored {summary['new_articles']} new articles, {summary['bodies_extracted']} with full text")

    articles = db.recent_articles(conn, args.days)
    clusters = cluster(articles, args.min_shared)
    report(articles, clusters)
    if not args.dry_run:
        db.replace_clusters(conn, articles, clusters)
    summary.update(
        articles_in_window=len(articles),
        clusters=len(clusters),
        largest_cluster=max((len(c["members"]) for c in clusters), default=0),
        min_shared=args.min_shared,
        days=args.days,
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
