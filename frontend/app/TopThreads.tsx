"use client";

import { sourceColor, type TimelineCluster } from "./api";

type Props = { clusters: TimelineCluster[]; selectedId: number | null; onSelect: (id: number) => void };

export default function TopThreads({ clusters, selectedId, onSelect }: Props) {
  const top = [...clusters].sort((a, b) => b.count - a.count).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <aside className="rise border-[3px] border-ink bg-ink p-4 text-paper shadow-hard-lg" style={{ animationDelay: "0.2s" }}>
      <p className="font-num text-2xl leading-none tracking-[0.15em] text-haldi uppercase">sabse badi khabar</p>
      <p className="mt-1 font-sans text-xs text-paper/60">the biggest threads right now</p>
      <ol className="mt-3 divide-y-2 divide-paper/15">
        {top.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex w-full gap-3 py-3 text-left transition-colors ${
                c.id === selectedId ? "text-haldi" : "hover:text-haldi"
              }`}
            >
              <span className="font-num text-5xl leading-none">0{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-sans text-sm font-semibold leading-snug">{c.latest_title}</span>
                <span className="mt-1.5 flex items-center gap-1.5 font-num text-lg leading-none text-paper/70">
                  {c.count} articles
                  <span className="ml-1 flex gap-1">
                    {c.sources.map((s) => (
                      <span key={s} className="h-2.5 w-2.5 rounded-full border border-paper/40" style={{ background: sourceColor(s) }} />
                    ))}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
