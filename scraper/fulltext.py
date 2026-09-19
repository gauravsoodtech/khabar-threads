"""Fetch each article page and pull out the main body text with trafilatura.

Pages fail for many reasons (consent walls, timeouts, odd markup, bot checks).
A failure here just leaves body = None; it never stops the run.
"""
from concurrent.futures import ThreadPoolExecutor

import trafilatura

from .feeds import fetch

MAX_BODY_CHARS = 20_000


def extract_one(url: str) -> str | None:
    try:
        page = fetch(url, timeout=10)
        text = trafilatura.extract(page, url=url, include_comments=False, include_tables=False)
        return text[:MAX_BODY_CHARS] if text else None
    except Exception:
        return None


def fetch_bodies(urls: list[str], workers: int = 8) -> dict[str, str | None]:
    """Fetch pages in parallel; returns {url: body_or_None}."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(zip(urls, pool.map(extract_one, urls)))
