"""The smallest check that fails if the grouping logic breaks.  Run:  python -m scraper.test_cluster"""
from .cluster import cluster, tokens

ARTICLES = [
    {"title": "Senate passes election bill after late-night vote", "summary": "The bill on election rules cleared the Senate."},
    {"title": "Election bill clears Senate vote", "summary": "Senators voted on the election bill late on Tuesday."},
    {"title": "Volcano erupts on remote island, villages evacuated", "summary": "Lava from the volcano forced evacuation of island villages."},
    {"title": "Island volcano eruption forces evacuation", "summary": "Villages near the erupting volcano were evacuated."},
    {"title": "Local bakery wins national bread award", "summary": "A small bakery took the top prize for sourdough."},
]


def test() -> None:
    assert "the" not in tokens("The senate"), "stop words must be removed"
    assert "trumps" in tokens("Trump's plan"), "possessives must not split into a stray letter"

    clusters = cluster(ARTICLES, min_shared=3)
    groups = sorted(sorted(c["members"]) for c in clusters)
    assert groups == [[0, 1], [2, 3]], groups  # two real stories, the bakery stays alone
    assert all(len(c["label"].split(" / ")) == 3 for c in clusters), [c["label"] for c in clusters]
    assert cluster(ARTICLES, min_shared=99) == [], "an impossible threshold must give no clusters"
    print("ok:", [c["label"] for c in clusters])


if __name__ == "__main__":
    test()
