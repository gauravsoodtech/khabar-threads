"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, fmtTime, getJob, getTimeline, sourceColor, triggerIngest, type Timeline, type TimelineCluster } from "./api";
import Drawer from "./Drawer";
import TimelineChart from "./Timeline";

type Load =
  | { state: "loading" }
  | { state: "waking"; attempt: number }
  | { state: "ready" }
  | { state: "error"; message: string };

type Refresh =
  | { state: "idle" }
  | { state: "running"; jobId: string }
  | { state: "done"; message: string }
  | { state: "failed"; message: string };

export default function Page() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [refresh, setRefresh] = useState<Refresh>({ state: "idle" });

  const reload = useCallback(async (quiet = false) => {
    try {
      const data = await getTimeline((attempt) => {
        if (!quiet) setLoad({ state: "waking", attempt });
      });
      setTimeline(data);
      setLoad({ state: "ready" });
    } catch (err) {
      if (!quiet) setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // First load, then (stretch goal) a quiet reload every minute so the view stays live.
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void reload(true);
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [reload]);

  // Refresh data: the job was triggered; poll it every 2 s, reload the timeline when it finishes.
  useEffect(() => {
    if (refresh.state !== "running") return;
    const { jobId } = refresh;
    const id = setInterval(async () => {
      try {
        const job = await getJob(jobId);
        if (job.status === "done") {
          clearInterval(id);
          await reload(true);
          const s = job.summary ?? {};
          setRefresh({ state: "done", message: `${s.new_articles ?? 0} new articles, ${s.clusters ?? 0} topics` });
        } else if (job.status === "failed") {
          clearInterval(id);
          setRefresh({ state: "failed", message: job.error ?? "the scraper failed" });
        }
      } catch (err) {
        clearInterval(id);
        if (err instanceof ApiError && err.status === 404) {
          await reload(true); // the API restarted and forgot the job; the data is still there
          setRefresh({ state: "done", message: "API restarted, showing the latest data" });
        } else {
          setRefresh({ state: "failed", message: err instanceof Error ? err.message : String(err) });
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }, [refresh, reload]);

  async function onRefresh() {
    try {
      setRefresh({ state: "running", jobId: await triggerIngest() });
    } catch (err) {
      setRefresh({ state: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function toggleSource(source: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  const visible = useMemo(() => filterBySource(timeline?.clusters ?? [], hidden), [timeline, hidden]);
  const sources = timeline?.sources ?? [];
  const status =
    refresh.state === "running"
      ? "Scraping the feeds and regrouping, usually 30 to 60 seconds"
      : refresh.state === "done"
        ? `Done: ${refresh.message}`
        : refresh.state === "failed"
          ? `Refresh failed: ${refresh.message}`
          : timeline
            ? `Updated ${fmtTime(timeline.generatedAt)}`
            : "";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">News Pulse</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Topic timeline</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Live articles from BBC, NPR, the Guardian and Al Jazeera, grouped into stories. Each bar runs from a
            story&apos;s first article to its latest; a bolder bar means more coverage. Click one to read the articles.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refresh.state === "running"}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
          >
            {refresh.state === "running" && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {refresh.state === "running" ? "Refreshing" : "Refresh data"}
          </button>
          <p className={`text-xs ${refresh.state === "failed" ? "text-rose-600" : "text-slate-500"}`}>{status}</p>
        </div>
      </header>

      {sources.length > 0 && (
        <section className="mt-6 flex flex-wrap items-center gap-2" aria-label="Filter by source">
          {sources.map(({ source, count }) => {
            const on = !hidden.has(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  on
                    ? "border-slate-300 bg-white text-slate-800 shadow-sm"
                    : "border-dashed border-slate-300 bg-transparent text-slate-400 line-through"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? sourceColor(source) : "#cbd5e1" }} />
                {source}
                <span className="text-slate-400">{count}</span>
              </button>
            );
          })}
          <span className="text-xs text-slate-400">Click a source to hide or show it</span>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {load.state === "loading" && <Notice>Loading the timeline</Notice>}
        {load.state === "waking" && (
          <Notice spinner>
            Waking up the API. It runs on a free tier that sleeps when idle, so the first load can take up to a
            minute (attempt {load.attempt}).
          </Notice>
        )}
        {load.state === "error" && <Notice tone="error">Could not reach the API: {load.message}</Notice>}
        {load.state === "ready" && visible.length === 0 && (
          <Notice>No topic clusters to show yet. Press Refresh data to pull the latest news.</Notice>
        )}
        {load.state === "ready" && visible.length > 0 && timeline && (
          <TimelineChart
            clusters={visible}
            now={+new Date(timeline.generatedAt)}
            selectedId={selected}
            onSelect={setSelected}
          />
        )}
      </section>

      <footer className="mt-4 text-xs text-slate-400">
        Dots mark individual articles, coloured by source. Times are shown in your local timezone.
      </footer>

      {selected !== null && <Drawer key={selected} clusterId={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Notice({ children, spinner, tone }: { children: React.ReactNode; spinner?: boolean; tone?: "error" }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 px-4 py-16 text-center text-sm ${
        tone === "error" ? "text-rose-600" : "text-slate-500"
      }`}
    >
      {spinner && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />}
      <span className="max-w-md">{children}</span>
    </div>
  );
}

/** Hide sources client-side: drop their articles from every cluster and recompute the spans and sizes. */
function filterBySource(clusters: TimelineCluster[], hidden: Set<string>): TimelineCluster[] {
  if (hidden.size === 0) return clusters;
  const kept = clusters.flatMap((c) => {
    const points = c.points.filter((p) => !hidden.has(p.source));
    if (points.length === 0) return [];
    return [
      {
        ...c,
        points,
        count: points.length,
        start: points[0].t,
        end: points[points.length - 1].t,
        sources: c.sources.filter((s) => !hidden.has(s)),
      },
    ];
  });
  const max = Math.max(1, ...kept.map((c) => c.count));
  return kept.map((c) => ({ ...c, intensity: c.count / max }));
}
