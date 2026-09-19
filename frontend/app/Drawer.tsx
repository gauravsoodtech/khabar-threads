"use client";

import { useEffect, useState } from "react";
import { fmtTime, getCluster, sourceColor, type ClusterDetail } from "./api";

// Cluster detail: every article in the story, oldest first. Mounted with key={clusterId}
// by the page, so switching clusters starts from a clean state.

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
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Cluster detail">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Topic</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{detail?.label ?? "Loading…"}</h2>
            {articles.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">
                {articles.length} articles from {sources.join(", ")} · {fmtTime(articles[0].published_at)} to{" "}
                {fmtTime(articles[articles.length - 1].published_at)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </div>

        {error && <p className="px-6 py-4 text-sm text-rose-600">{error}</p>}

        <ol className="divide-y divide-slate-100 px-6">
          {articles.map((a) => (
            <li key={a.id} className="py-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: sourceColor(a.source) }} />
                <span className="font-medium text-slate-700">{a.source}</span>
                <span>·</span>
                <time dateTime={a.published_at}>{fmtTime(a.published_at)}</time>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-base font-medium text-slate-900 hover:text-indigo-700"
              >
                {a.title} <span className="text-slate-400">↗</span>
              </a>
              {a.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.summary}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {a.body ? `Full text extracted, ${a.body.split(/\s+/).length} words` : "Full text not available for this page"}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
