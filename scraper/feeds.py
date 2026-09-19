"""Pull items from a few public RSS feeds and normalise them into one schema.

Every outlet has its own quirks: NPR puts the long text in <content:encoded>, BBC and
the Guardian in <description>; dates carry different timezone suffixes ("GMT", "-0400",
"+0000"); an item can arrive without a date at all. Everything leaves this module as
the same plain dict:

    {"url", "source", "title", "summary", "published_at"}
"""
import html
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, urlunsplit

FEEDS = {
    "BBC": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "NPR": "https://feeds.npr.org/1004/rss.xml",
    "Guardian": "https://www.theguardian.com/world/rss",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

# Some outlets answer 403 to urllib's default agent; a browser-like one is enough.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPulse/1.0",
    "Accept": "text/html,application/xml,application/rss+xml,*/*",
}
NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def fetch(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def strip_html(text: str | None) -> str:
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", text or ""))).strip()


def canonical_url(url: str) -> str:
    """Drop the query string and fragment. NPR appends ?utm_medium=RSS to every link,
    which would make the same story look new on every run and defeat the UNIQUE(url) dedup."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def parse_date(text: str | None, fallback: datetime) -> datetime:
    """RFC 822 first (what RSS 2.0 specifies), ISO 8601 second, fetch time last.
    Always returns a timezone-aware UTC datetime."""
    dt = None
    if text:
        for parser in (parsedate_to_datetime, datetime.fromisoformat):
            try:
                dt = parser(text.strip())
                break
            except (TypeError, ValueError):
                continue
    if dt is None:
        dt = fallback
    if dt.tzinfo is None:  # "-0000" and bare ISO strings come back naive
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_feed(source: str, xml_bytes: bytes, fetched_at: datetime) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for item in root.iter("item"):
        link = (item.findtext("link") or "").strip()
        title = strip_html(item.findtext("title"))
        if not link or not title:
            continue
        # Field names differ per outlet: short <description> first, full <content:encoded> as fallback.
        summary = item.findtext("description") or item.findtext("content:encoded", namespaces=NS)
        # Same for dates: <pubDate> is standard, <dc:date> is what some feeds use instead.
        date_text = item.findtext("pubDate") or item.findtext("dc:date", namespaces=NS)
        items.append(
            {
                "url": canonical_url(link),
                "source": source,
                "title": title,
                "summary": strip_html(summary),
                "published_at": parse_date(date_text, fetched_at),
            }
        )
    return items


def pull_all(max_per_feed: int, log=print) -> tuple[list[dict], dict[str, int]]:
    """Fetch every feed. A broken feed is logged and skipped; it never stops the run."""
    fetched_at = datetime.now(timezone.utc)
    articles: list[dict] = []
    counts: dict[str, int] = {}
    for source, url in FEEDS.items():
        try:
            items = parse_feed(source, fetch(url), fetched_at)[:max_per_feed]
        except Exception as exc:  # network error, 403, malformed XML: carry on with the other feeds
            log(f"feed {source}: FAILED ({exc})")
            counts[source] = 0
            continue
        counts[source] = len(items)
        articles.extend(items)
        log(f"feed {source}: {len(items)} items")
    return articles, counts
