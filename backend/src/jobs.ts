import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Job = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  summary: unknown; // the JSON line the scraper prints on stdout when it finishes
  error: string | null;
  log: string; // tail of the scraper's stderr, useful when a job fails
};

// ponytail: in-memory job store, one Render instance. Move to a jobs table if this ever runs on more than one.
const jobs = new Map<string, Job>();
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function runningJob(): Job | undefined {
  for (const job of jobs.values()) {
    if (job.status === "queued" || job.status === "running") return job;
  }
  return undefined;
}

/** Spawn `python -m scraper.run` from the repo root and track it. Returns immediately. */
export function startJob(): Job {
  const job: Job = {
    id: randomUUID(),
    status: "queued",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    summary: null,
    error: null,
    log: "",
  };
  jobs.set(job.id, job);

  // PYTHON_BIN may be a bare command (Docker: the venv is on PATH) or a repo-relative venv path (local dev).
  const bin = process.env.PYTHON_BIN ?? "python";
  const command = bin.includes("/") || bin.includes("\\") ? path.resolve(REPO_ROOT, bin) : bin;

  let stdout = "";
  const child = spawn(command, ["-m", "scraper.run"], { cwd: REPO_ROOT, env: process.env });
  job.status = "running";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    job.log = (job.log + chunk.toString()).slice(-2000);
  });
  child.on("error", (err) => finish(job, `could not start the scraper: ${err.message}`));
  child.on("close", (code) => {
    if (code !== 0) return finish(job, `scraper exited with code ${code}`);
    const lastLine = stdout.trim().split("\n").at(-1) ?? "";
    try {
      job.summary = JSON.parse(lastLine);
    } catch {
      job.summary = { raw: lastLine };
    }
    finish(job, null);
  });
  return job;
}

function finish(job: Job, error: string | null): void {
  if (job.finishedAt) return; // "error" and "close" can both fire for one child
  job.status = error ? "failed" : "done";
  job.error = error;
  job.finishedAt = new Date().toISOString();
}
