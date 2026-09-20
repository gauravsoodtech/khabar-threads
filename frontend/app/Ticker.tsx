"use client";

import type { Latest } from "./api";

// The breaking-news bar every Indian channel has, minus the shouting. Newest headlines
// scroll past; the list is doubled so the loop has no seam. Hover to pause.

type Props = { items: Latest[]; onPick: (clusterId: number) => void };

export default function Ticker({ items, onPick }: Props) {
  if (items.length === 0) return null;
  const loop = [...items, ...items];
  return (
    <div className="ticker sticky top-0 z-30 flex border-b-[3px] border-ink bg-ink text-paper">
      <span className="shrink-0 border-r-[3px] border-ink bg-haldi px-3 py-2 font-num text-xl leading-none tracking-[0.2em] text-ink uppercase">
        abhi abhi
      </span>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track flex w-max items-center" style={{ animationDuration: `${items.length * 6}s` }}>
          {loop.map((a, i) => (
            <button
              key={`${a.id}-${i}`}
              type="button"
              onClick={() => (a.cluster_id ? onPick(a.cluster_id) : window.open(a.url, "_blank", "noopener"))}
              className="flex shrink-0 items-center gap-3 px-5 py-2 text-left font-sans text-sm hover:text-haldi"
            >
              <span className="font-num text-lg leading-none tracking-wider text-haldi uppercase">{a.source}</span>
              <span className="whitespace-nowrap">{a.title}</span>
              <span className="text-paper/30">◆</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
