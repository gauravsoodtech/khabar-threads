"use client";

import { useEffect, useState } from "react";
import { fmtTime, getCluster, sourceColor, sourceText, timeAgo, type ClusterDetail } from "./api";

// One thread, every article in it, oldest first. The page mounts this with key={clusterId},
// so switching threads starts from a clean state.

type Props = { clusterId: number; onClose: () => void };

export default function Drawer({ clusterId, onClose }: Props) {
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCluster(clusterId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const articles = detail?.articles ?? [];
  const sources = Array.from(new Set(articles.map((a) => a.source)));

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Thread detail">
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <aside className="drawer relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l-[3px] border-ink bg-paper">
        <div className="sticky top-0 z-10 border-b-[3px] border-ink bg-paper px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="sticker -rotate-2 bg-haldi px-2 py-0.5 font-num text-lg leading-none tracking-[0.2em] uppercase">
                thread
              </span>
              <h2 className="mt-3 font-display text-3xl leading-tight break-words">{detail?.label ?? "loading"}</h2>
              {articles.length > 0 && (
                <p className="mt-1 font-num text-lg leading-tight text-ink/70">
                  {articles.length} articles from {sources.join(", ")} · {fmtTime(articles[0].published_at)} to{" "}
                  {fmtTime(articles[articles.length - 1].published_at)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="sticker btn-press shrink-0 bg-paper px-3 py-1 font-num text-xl leading-none tracking-widest uppercase"
            >
              close
            </button>
          </div>
        </div>

        {error && <p className="px-6 py-4 font-sans text-sm text-kumkum">{error}</p>}

        {!detail && !error && (
          <div className="space-y-4 px-6 py-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-28 border-[3px] border-ink" />
            ))}
          </div>
        )}

        <ol className="px-6 pt-2 pb-10">
          {articles.map((a) => (
            <li key={a.id} className="mt-4 border-[3px] border-ink bg-paper p-4 shadow-hard">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="sticker -rotate-2 px-2 py-0.5 font-num text-base leading-none tracking-wider uppercase"
                  style={{ background: sourceColor(a.source), color: sourceText(a.source) }}
                >
                  {a.source}
                </span>
                <time dateTime={a.published_at} className="font-num text-lg leading-none text-ink/70">
                  {fmtTime(a.published_at)} · {timeAgo(a.published_at)}
                </time>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block font-sans text-lg leading-snug font-bold text-ink underline decoration-rani decoration-[3px] underline-offset-4 hover:bg-haldi"
              >
                {a.title} ↗
              </a>
              {a.summary && <p className="mt-2 line-clamp-3 font-sans text-sm text-ink/80">{a.summary}</p>}
              <p className="mt-2 font-num text-base leading-none tracking-wider text-ink/50 uppercase">
                {a.body ? `full text pulled · ${a.body.split(/\s+/).length} words` : "full text not available for this page"}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
