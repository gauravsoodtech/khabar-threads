// Everything the UI knows about the backend lives here.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

export type Point = { t: string; source: string };
export type TimelineCluster = {
  id: number;
  label: string;
  count: number;
  start: string;
  end: string;
  sources: string[];
  latest_title: string;
  points: Point[];
  intensity: number; // count / largest cluster's count, 0..1
};
export type Timeline = {
  generatedAt: string;
  range: { start: string; end: string } | null;
  sources: { source: string; count: number }[];
  clusters: TimelineCluster[];
};
export type Article = {
  id: number;
  url: string;
  source: string;
  title: string;
  summary: string;
  body: string | null;
  published_at: string;
};
export type Latest = { id: number; title: string; source: string; url: string; published_at: string; cluster_id: number | null };
export type ClusterDetail = { id: number; label: string; created_at: string; articles: Article[] };
export type Job = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  log: string;
};

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The API sleeps on Render's free tier and takes up to a minute to wake. Network errors
// and 5xx in that window get retried; a real 4xx is thrown straight away.
export async function getTimeline(onWaiting?: (attempt: number) => void): Promise<Timeline> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request<Timeline>("/timeline");
    } catch (err) {
      if ((err instanceof ApiError && err.status < 500) || attempt >= 30) throw err;
      onWaiting?.(attempt);
      await sleep(3000);
    }
  }
}

export const getLatest = (limit = 15) => request<Latest[]>(`/articles?limit=${limit}`);
export const getCluster = (id: number) => request<ClusterDetail>(`/clusters/${id}`);
export const getJob = (id: string) => request<Job>(`/ingest/status/${id}`);

// 202 means started, 409 means one is already running; either way there is a job to follow.
export async function triggerIngest(): Promise<string> {
  try {
    const { jobId } = await request<{ jobId: string }>("/ingest/trigger", { method: "POST" });
    return jobId;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && typeof err.body.jobId === "string") return err.body.jobId;
    throw err;
  }
}

const SOURCE_COLORS: Record<string, string> = {
  BBC: "#c8102e",
  NPR: "#2447d0",
  Guardian: "#0e7c7b",
  "Al Jazeera": "#f2a900",
};
export const sourceColor = (source: string) => SOURCE_COLORS[source] ?? "#6b6560";
// ink on the marigold, paper on everything else
export const sourceText = (source: string) => (source === "Al Jazeera" ? "#141210" : "#f4ead8");

const timeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const fmtTime = (iso: string) => timeFormat.format(new Date(iso));

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
