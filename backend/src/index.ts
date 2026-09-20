import cors from "cors";
import express from "express";
import { applySchema, pool } from "./db.ts";
import { getJob, runningJob, startJob } from "./jobs.ts";

const app = express();

const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));

app.get("/", (_req, res) => {
  res.json({
    name: "Khabar Threads API",
    endpoints: [
      "GET  /health",
      "GET  /articles?limit=15",
      "GET  /clusters",
      "GET  /clusters/:id",
      "GET  /timeline",
      "POST /ingest/trigger",
      "GET  /ingest/status/:jobId",
    ],
  });
});

app.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

const CLUSTER_SUMMARY_SQL = `
  SELECT c.id, c.label,
         COUNT(a.id)::int                              AS count,
         MIN(a.published_at)                           AS start,
         MAX(a.published_at)                           AS "end",
         array_agg(DISTINCT a.source ORDER BY a.source) AS sources
  FROM clusters c
  JOIN articles a ON a.cluster_id = c.id
  GROUP BY c.id
  ORDER BY start`;

// Newest articles across every source, clustered or not. Feeds the headline ticker.
app.get("/articles", async (req, res) => {
  const limit = req.query.limit === undefined ? 15 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    res.status(400).json({ error: "limit must be a whole number from 1 to 50" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT id, title, source, url, published_at, cluster_id FROM articles ORDER BY published_at DESC LIMIT $1",
    [limit],
  );
  res.json(rows);
});

app.get("/clusters", async (_req, res) => {
  const { rows } = await pool.query(CLUSTER_SUMMARY_SQL);
  res.json(rows);
});

app.get("/clusters/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id must be a positive integer" });
    return;
  }
  const cluster = await pool.query("SELECT id, label, created_at FROM clusters WHERE id = $1", [id]);
  if (cluster.rowCount === 0) {
    res.status(404).json({ error: `cluster ${id} not found` });
    return;
  }
  const articles = await pool.query(
    `SELECT id, url, source, title, summary, body, published_at
     FROM articles WHERE cluster_id = $1 ORDER BY published_at`,
    [id],
  );
  res.json({ ...cluster.rows[0], articles: articles.rows });
});

// Shaped for plotting: every cluster is a span (start, end) with a size metric, plus the
// individual article times so the frontend can filter by source without another request.
app.get("/timeline", async (_req, res) => {
  const [clusters, sources, last] = await Promise.all([
    pool.query(`
      SELECT c.id, c.label,
             COUNT(a.id)::int                              AS count,
             MIN(a.published_at)                           AS start,
             MAX(a.published_at)                           AS "end",
             array_agg(DISTINCT a.source ORDER BY a.source) AS sources,
             (array_agg(a.title ORDER BY a.published_at DESC))[1] AS latest_title,
             json_agg(json_build_object('t', a.published_at, 'source', a.source, 'title', a.title)
                      ORDER BY a.published_at)             AS points
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      ORDER BY start`),
    pool.query("SELECT source, COUNT(*)::int AS count FROM articles GROUP BY source ORDER BY source"),
    pool.query("SELECT MAX(fetched_at) AS last_fetch FROM articles"),
  ]);
  const max = Math.max(1, ...clusters.rows.map((c) => c.count as number));
  const starts = clusters.rows.map((c) => +new Date(c.start));
  const ends = clusters.rows.map((c) => +new Date(c.end));
  res.json({
    generatedAt: new Date().toISOString(),
    lastFetch: last.rows[0]?.last_fetch ?? null,
    range: clusters.rows.length
      ? { start: new Date(Math.min(...starts)).toISOString(), end: new Date(Math.max(...ends)).toISOString() }
      : null,
    sources: sources.rows,
    clusters: clusters.rows.map((c) => ({ ...c, intensity: c.count / max })),
  });
});

app.post("/ingest/trigger", (_req, res) => {
  const running = runningJob();
  if (running) {
    res.status(409).json({ error: "an ingest job is already running", jobId: running.id });
    return;
  }
  const job = startJob();
  res.status(202).json({ jobId: job.id, status: job.status });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.get("/ingest/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  if (!UUID_RE.test(jobId)) {
    res.status(400).json({ error: "jobId must be a UUID" });
    return;
  }
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: `job ${jobId} not found (the API may have restarted)` });
    return;
  }
  res.json(job);
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

const port = Number(process.env.PORT ?? 3001);
await applySchema();
app.listen(port, () => console.log(`Khabar Threads API listening on :${port}`));
