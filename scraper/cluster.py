"""Group articles that are about the same story: keyword-overlap clustering.

1. Turn each article's headline, and its headline plus the first 60 words of its summary,
   into sets of meaningful words: lowercase, letters only, at least 3 characters, stop words
   removed.
2. Two articles are linked when they share at least `min_shared` meaningful words AND at
   least one of those words appears in both headlines. The headline rule stops two long
   summaries that merely share a few generic words from linking unrelated stories.
3. Follow the links: every connected group of articles is one cluster (union-find).
4. Label each cluster with the three words most of its articles have in common.
"""
import re
from collections import Counter
from itertools import combinations
from pathlib import Path

WORD_RE = re.compile(r"[a-z]{3,}")
SUMMARY_WORDS = 60  # equalises BBC's one-line descriptions against the Guardian's paragraphs
STOPWORDS = frozenset(
    line.strip()
    for line in (Path(__file__).parent / "stopwords.txt").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.startswith("#")
)


def tokens(text: str) -> frozenset[str]:
    text = (text or "").lower().replace("'", "")  # "trump's" -> "trumps", not "trump" + "s"
    return frozenset(w for w in WORD_RE.findall(text) if w not in STOPWORDS)


def find_root(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]  # path halving keeps the chains short
        i = parent[i]
    return i


def cluster(articles: list[dict], min_shared: int = 3) -> list[dict]:
    """articles: dicts with "title" and "summary".
    Returns [{"label": str, "members": [article indexes]}] for every group of 2+ articles,
    largest first. Singletons are not clusters: a story only one outlet ran is not a topic yet."""
    heads = [tokens(a["title"]) for a in articles]
    toks = [
        h | tokens(" ".join((a.get("summary") or "").split()[:SUMMARY_WORDS]))
        for h, a in zip(heads, articles)
    ]
    parent = list(range(len(articles)))
    # ponytail: O(n^2) pairwise scan; fine for a few hundred articles, index by word if it ever sees tens of thousands.
    for i, j in combinations(range(len(articles)), 2):
        if len(toks[i] & toks[j]) >= min_shared and heads[i] & heads[j]:
            parent[find_root(parent, i)] = find_root(parent, j)  # union

    groups: dict[int, list[int]] = {}
    for i in range(len(articles)):
        groups.setdefault(find_root(parent, i), []).append(i)

    clusters = []
    for members in groups.values():
        if len(members) < 2:
            continue
        counts = Counter(w for m in members for w in sorted(toks[m]))  # each article votes once per word
        label = " / ".join(w for w, _ in counts.most_common(3))
        clusters.append({"label": label, "members": members})
    clusters.sort(key=lambda c: -len(c["members"]))
    return clusters
