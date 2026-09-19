import { readFileSync } from "node:fs";
import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

// Neon's free tier suspends an idle database and the pooled sockets die with it. A short idle
// timeout plus an error listener keep that from crashing the process (an unhandled pool
// "error" event would). sslmode=require in the URL is enough: Neon's certificate is publicly signed.
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
pool.on("error", (err) => console.error("pg pool error:", err.message));

/** Same schema.sql the scraper applies; idempotent, so the API works cold before the first ingest. */
export async function applySchema(): Promise<void> {
  const sql = readFileSync(new URL("../../scraper/schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}
