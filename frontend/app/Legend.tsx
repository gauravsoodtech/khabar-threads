"use client";

import { useSyncExternalStore } from "react";

// The "how to read this" strip. Shown until the reader presses "got it"; the flag lives in
// localStorage and is read through useSyncExternalStore so the server render (which cannot
// see storage) and the browser agree without a hydration warning.

const KEY = "kt.legend";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLegendDismissed(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setLegendDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // private mode or blocked storage: the strip just shows again next time
  }
  listeners.forEach((cb) => cb());
}

const BEADS = ["#c8102e", "#2447d0", "#0e7c7b"];

export default function Legend({ onClose }: { onClose: () => void }) {
  return (
    <section
      className="rise mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 border-[3px] border-ink bg-haldi px-5 py-4 shadow-hard"
      aria-label="How to read the timeline"
    >
      <span className="font-num text-2xl leading-none tracking-[0.15em] uppercase">how to read this</span>
      <Item pic={<span className="block h-3 w-16 border-2 border-ink bg-genda" />}>
        one ribbon is one story, from its first article to its latest
      </Item>
      <Item
        pic={
          <span className="flex h-3 w-16 items-center justify-around border-2 border-ink bg-genda">
            {BEADS.map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full border-2 border-ink" style={{ background: c }} />
            ))}
          </span>
        }
      >
        beads are articles, coloured by source
      </Item>
      <Item pic={<span className="block h-5 w-16 border-2 border-ink bg-rani" />}>thicker and pinker means more coverage</Item>
      <Item pic={<span className="font-num text-xl leading-none uppercase">click</span>}>a ribbon to read the whole thread</Item>
      <button
        type="button"
        onClick={onClose}
        className="sticker btn-press ml-auto bg-ink px-3 py-1 font-num text-lg leading-none tracking-widest text-haldi uppercase"
      >
        got it
      </button>
    </section>
  );
}

function Item({ pic, children }: { pic: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3 font-sans text-sm">
      <span className="shrink-0">{pic}</span>
      {children}
    </span>
  );
}
