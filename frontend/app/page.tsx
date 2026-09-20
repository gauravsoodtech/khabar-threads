"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  fmtTime,
  getJob,
  getLatest,
  getTimeline,
  sourceColor,
  sourceText,
  timeAgo,
  triggerIngest,
  type Latest,
  type Timeline,
  type TimelineCluster,
} from "./api";
import Drawer from "./Drawer";
import Legend, { setLegendDismissed, useLegendDismissed } from "./Legend";
import Ticker from "./Ticker";
import TimelineChart from "./Timeline";
import TopThreads from "./TopThreads";

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

const HOUR = 3_600_000;
const PERIODS = { "6h": 6 * HOUR, "24h": 24 * HOUR, all: Infinity } as const;
type Period = keyof typeof PERIODS;

export default function Page() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [latest, setLatest] = useState<Latest[]>([]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [refresh, setRefresh] = useState<Refresh>({ state: "idle" });
  const [progress, setProgress] = useState("");
  const legendDismissed = useLegendDismissed();

  const reload = useCallback(async (quiet = false) => {
    try {
      const data = await getTimeline((attempt) => {
        if (!quiet) setLoad({ state: "waking", attempt });
      });
      setTimeline(data);
      setLoad({ state: "ready" });
      getLatest().then(setLatest).catch(() => {}); // the ticker is decoration, never block the page on it
    } catch (err) {
      if (!quiet) setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // first load, then a quiet reload every minute so the page stays live
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

  // a fetch job is running: poll it every 2 s, show its last log line, reload when it ends
  const jobId = refresh.state === "running" ? refresh.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    const id = setInterval(async () => {
      try {
        const job = await getJob(jobId);
        const lines = (job.log ?? "").trim().split("\n");
        setProgress(lines[lines.length - 1] ?? "");
        if (job.status === "done") {
          clearInterval(id);
          await reload(true);
          const s = job.summary ?? {};
          setRefresh({ state: "done", message: `${s.new_articles ?? 0} new articles, ${s.clusters ?? 0} threads` });
        } else if (job.status === "failed") {
          clearInterval(id);
          setRefresh({ state: "failed", message: job.error ?? "the scraper failed" });
        }
      } catch (err) {
        clearInterval(id);
        if (err instanceof ApiError && err.status === 404) {
          await reload(true); // the API restarted and forgot the job; the data is still there
          setRefresh({ state: "done", message: "server restarted, showing the latest data" });
        } else {
          setRefresh({ state: "failed", message: err instanceof Error ? err.message : String(err) });
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }, [jobId, reload]);

  async function onRefresh() {
    setProgress("");
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

  const visible = useMemo(() => filterThreads(timeline, hidden, period, query), [timeline, hidden, period, query]);
  const sources = timeline?.sources ?? [];
  const totalArticles = sources.reduce((n, s) => n + s.count, 0);
  const running = refresh.state === "running";
  const status =
    refresh.state === "running"
      ? progress || "reading the feeds"
      : refresh.state === "done"
        ? `done: ${refresh.message}`
        : refresh.state === "failed"
          ? `failed: ${refresh.message}`
          : timeline
            ? `updated ${fmtTime(timeline.generatedAt)}`
            : "";
  const dateline = timeline
    ? new Date(timeline.generatedAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <>
      <Ticker items={latest} onPick={setSelected} />

      <main className="mx-auto w-full max-w-7xl px-4 pt-8 pb-12 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div className="rise">
            <p className="font-num text-xl leading-none tracking-[0.2em] text-ink/70 uppercase">{dateline || " "}</p>
            <h1 className="mt-1 font-display text-[4.6rem] leading-[0.9] text-ink sm:text-[7rem]">
              खबर <span className="text-rani">threads</span>
            </h1>
            <p className="mt-4 max-w-xl font-sans text-lg leading-snug text-ink/80">
              four newsrooms, one timeline. every story is a thread: it starts when the first outlet runs it and
              ends with the latest article. thicker thread, bigger story. click one to read.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <span className="sticker pop -rotate-3 bg-kumkum px-3 py-1 font-num text-2xl leading-none tracking-[0.25em] text-paper uppercase">
              <span className="live-dot" />
              live
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={running}
              className={`sticker btn-press px-6 py-2 font-num text-3xl leading-none tracking-wider uppercase disabled:cursor-wait ${
                running ? "stripes text-ink [text-shadow:0_0_6px_var(--color-haldi),0_0_12px_var(--color-haldi)]" : "bg-haldi text-ink"
              }`}
            >
              {running ? "fetching" : "fetch latest"}
            </button>
            <p className={`max-w-xs font-sans text-sm sm:text-right ${refresh.state === "failed" ? "text-kumkum" : "text-ink/70"}`}>
              {status}
            </p>
          </div>
        </header>

        {sources.length > 0 && (
          <section className="mt-8 flex flex-wrap items-center gap-3" aria-label="Filter by source">
            {sources.map(({ source, count }, i) => {
              const on = !hidden.has(source);
              return (
                <button
                  key={source}
                  type="button"
                  onClick={() => toggleSource(source)}
                  aria-pressed={on}
                  className={`sticker btn-press pop px-3 py-1 font-sans text-sm font-bold ${
                    on ? "" : "border-dashed bg-paper text-ink/50 line-through"
                  }`}
                  style={{
                    background: on ? sourceColor(source) : undefined,
                    color: on ? sourceText(source) : undefined,
                    rotate: `${[-2, 1, -1, 2][i % 4]}deg`,
                    animationDelay: `${0.3 + i * 0.08}s`,
                  }}
                >
                  {source} <span className="ml-1 font-num text-lg leading-none">{count}</span>
                </button>
              );
            })}
            <span className="font-sans text-xs text-ink/50">tap a source to hide or show it</span>
          </section>
        )}

        {load.state === "ready" && !legendDismissed && <Legend onClose={() => setLegendDismissed(true)} />}

        {timeline && (
          <section className="mt-6 flex flex-wrap items-center gap-3" aria-label="Search and time window">
            <label className="sticker flex items-center gap-2 bg-paper px-3 py-1.5">
              <span className="font-num text-lg leading-none tracking-widest text-ink/60 uppercase">search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="any word from a headline"
                className="w-56 bg-transparent font-sans text-sm outline-none placeholder:text-ink/40"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="font-num text-lg leading-none">
                  ✕
                </button>
              )}
            </label>
            <span className="font-sans text-xs text-ink/60">
              {visible.length} of {plural(timeline.clusters.length, "thread")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-sans text-xs text-ink/60">show</span>
              {(Object.keys(PERIODS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`sticker btn-press px-3 py-1 font-num text-lg leading-none tracking-widest uppercase ${
                    period === p ? "bg-ink text-haldi" : "bg-paper text-ink"
                  }`}
                >
                  {p === "all" ? "all" : `last ${p}`}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rise relative overflow-hidden border-[3px] border-ink bg-paper shadow-hard-lg" style={{ animationDelay: "0.1s" }}>
            <div aria-hidden className="pointer-events-none absolute right-2 -bottom-20 font-display text-[18rem] leading-none text-ink/[0.045] select-none">
              खबर
            </div>
            <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b-[3px] border-ink px-4 py-2">
              <span className="font-num text-2xl leading-none tracking-[0.15em] uppercase">the timeline</span>
              {timeline && (
                <span className="flex items-center gap-3 font-num text-lg leading-none text-ink/70">
                  {plural(totalArticles, "article")} · {plural(sources.length, "source")} · {plural(visible.length, "thread")}
                  {timeline.lastFetch && ` · fetched ${timeAgo(timeline.lastFetch, +new Date(timeline.generatedAt))}`}
                  <button
                    type="button"
                    onClick={() => setLegendDismissed(false)}
                    className="font-sans text-xs text-ink underline decoration-rani decoration-2 underline-offset-4 hover:text-rani"
                  >
                    how to read
                  </button>
                </span>
              )}
            </div>
            <div className="relative p-4">
              {load.state === "loading" && <Notice>loading the timeline</Notice>}
              {load.state === "waking" && (
                <Notice spinner>
                  waking the server up. it sleeps on a free tier, so the first load can take up to a minute. chai break.
                  attempt {load.attempt}.
                </Notice>
              )}
              {load.state === "error" && <Notice tone="error">could not reach the server: {load.message}</Notice>}
              {load.state === "ready" && visible.length === 0 && (
                <Notice>
                  {query.trim()
                    ? `nothing matches "${query.trim()}". try another word.`
                    : timeline && timeline.clusters.length > 0
                      ? "nothing in this window. try a wider one."
                      : "no threads to show yet. press fetch latest to pull today's news."}
                </Notice>
              )}
              {load.state === "ready" && visible.length > 0 && timeline && (
                <TimelineChart clusters={visible} now={+new Date(timeline.generatedAt)} selectedId={selected} onSelect={setSelected} />
              )}
            </div>
          </section>

          {load.state === "ready" && <TopThreads clusters={visible} selectedId={selected} onSelect={setSelected} />}
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-[3px] border-ink bg-ink px-5 py-4 font-sans text-sm text-paper">
          <span>
            built by{" "}
            <a href="https://github.com/gauravsoodtech/khabar-threads" target="_blank" rel="noopener noreferrer" className="underline decoration-haldi decoration-2 underline-offset-4 hover:text-haldi">
              gaurav sood
            </a>
            . khabar means news.
          </span>
          <span className="text-paper/70">stories from BBC, NPR, the Guardian and Al Jazeera · refreshed every 6 hours</span>
        </footer>
      </main>

      {selected !== null && <Drawer key={selected} clusterId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Notice({ children, spinner, tone }: { children: React.ReactNode; spinner?: boolean; tone?: "error" }) {
  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div
        className={`sticker flex max-w-md items-center gap-3 bg-paper px-5 py-4 font-sans text-sm ${
          tone === "error" ? "text-kumkum" : "text-ink"
        }`}
        style={{ rotate: "-1deg" }}
      >
        {spinner && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-[3px] border-ink border-t-haldi" />}
        <span>{children}</span>
      </div>
    </div>
  );
}

// Everything the reader can narrow by, in one pass: hidden sources, the time window, the search.
// Each thread keeps only the articles that survive, and its span and size are recomputed from them.
function filterThreads(timeline: Timeline | null, hidden: Set<string>, period: Period, query: string): TimelineCluster[] {
  if (!timeline) return [];
  const cutoff = +new Date(timeline.generatedAt) - PERIODS[period];
  const q = query.trim().toLowerCase();
  const kept = timeline.clusters.flatMap((c) => {
    const points = c.points.filter((p) => !hidden.has(p.source) && +new Date(p.t) >= cutoff);
    if (points.length === 0) return [];
    if (q && !c.label.includes(q) && !points.some((p) => p.title.toLowerCase().includes(q))) return [];
    return [
      {
        ...c,
        points,
        count: points.length,
        start: points[0].t,
        end: points[points.length - 1].t,
        sources: Array.from(new Set(points.map((p) => p.source))),
      },
    ];
  });
  const max = Math.max(1, ...kept.map((c) => c.count));
  return kept.map((c) => ({ ...c, intensity: c.count / max }));
}
