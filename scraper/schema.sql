-- Applied on every scraper run and on API boot. Idempotent.

CREATE TABLE IF NOT EXISTS clusters (
    id          SERIAL PRIMARY KEY,
    label       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
    id            SERIAL PRIMARY KEY,
    url           TEXT NOT NULL UNIQUE,          -- canonical (no query string), so re-runs cannot store a story twice
    source        TEXT NOT NULL,                 -- "BBC", "NPR", "Guardian", "Al Jazeera"
    title         TEXT NOT NULL,
    summary       TEXT NOT NULL DEFAULT '',
    body          TEXT,                          -- full article text, NULL when the page could not be parsed
    published_at  TIMESTAMPTZ NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    cluster_id    INTEGER REFERENCES clusters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at);
CREATE INDEX IF NOT EXISTS articles_cluster_id_idx   ON articles (cluster_id);
