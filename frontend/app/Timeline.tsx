"use client";

import { useEffect, useRef, useState } from "react";
import { fmtTime, sourceColor, type TimelineCluster } from "./api";

// Each cluster is a bar from its first article to its latest, on a shared time axis.
// Bars that would overlap are pushed into separate lanes; the biggest stories claim the top lanes.

const AXIS_H = 44; // px reserved for the tick labels
const LANE_H = 54; // px per lane: a label row above a bar
const MIN_BAR_PX = 14; // a two-article story minutes apart is still a visible pill
const HOUR = 3_600_000;

type Props = {
  clusters: TimelineCluster[];
  now: number; // when the data was generated, drawn as the "now" marker
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function TimelineChart({ clusters, now, selectedId, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { t0, t1 } = timeRange(clusters);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * width;
  const { placed, laneCount } = packLanes(clusters, x);
  const ticks = makeTicks(t0, t1);

  return (
    <div className="overflow-x-auto">
      <div ref={ref} className="relative min-w-[720px]" style={{ height: AXIS_H + laneCount * LANE_H + 8 }}>
        {width > 0 && (
          <>
            {ticks.map((tick) => (
              <div key={tick.t} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: x(tick.t) }}>
                <span className="absolute top-1 left-1 text-[11px] whitespace-nowrap text-slate-500">{tick.time}</span>
                {tick.day && (
                  <span className="absolute top-5 left-1 text-[11px] font-semibold whitespace-nowrap text-slate-700">
                    {tick.day}
                  </span>
                )}
              </div>
            ))}

            {now >= t0 && now <= t1 && (
              <div className="absolute top-0 bottom-0 border-l border-dashed border-rose-400" style={{ left: x(now) }}>
                <span className="absolute top-1 -translate-x-1/2 rounded bg-rose-500 px-1 text-[10px] font-medium text-white">
                  now
                </span>
              </div>
            )}

            {placed.map(({ c, lane, left, barWidth }) => {
              const barH = 12 + Math.round(c.intensity * 12); // stretch goal: bigger story, bolder bar
              const laneTop = AXIS_H + lane * LANE_H;
              const selected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  title={`${c.label}: ${c.count} articles, ${fmtTime(c.start)} to ${fmtTime(c.end)}`}
                  className="group absolute text-left focus:outline-none"
                  style={{ left, top: laneTop, height: LANE_H, width: Math.max(barWidth, 8) }}
                >
                  <span
                    className={`absolute top-1 left-0 text-xs font-medium whitespace-nowrap transition ${
                      selected ? "text-indigo-700" : "text-slate-800 group-hover:text-indigo-700"
                    }`}
                  >
                    {c.label}
                    <span className="ml-1 text-slate-400">{c.count}</span>
                  </span>
                  <span
                    className={`absolute left-0 block rounded-full transition group-hover:brightness-90 ${
                      selected ? "ring-2 ring-indigo-500 ring-offset-1" : ""
                    }`}
                    style={{
                      top: 24 + (24 - barH) / 2,
                      height: barH,
                      width: barWidth,
                      background: `rgba(15, 23, 42, ${0.15 + c.intensity * 0.7})`,
                    }}
                  >
                    {c.points.map((p, i) => (
                      <span
                        key={i}
                        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                        style={{ left: clamp(x(+new Date(p.t)) - left, 4, barWidth - 4), background: sourceColor(p.source) }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function timeRange(clusters: TimelineCluster[]) {
  let start = Math.min(...clusters.map((c) => +new Date(c.start)));
  let end = Math.max(...clusters.map((c) => +new Date(c.end)));
  if (end - start < 6 * HOUR) {
    // a very narrow window still needs a readable axis
    const mid = (start + end) / 2;
    start = mid - 3 * HOUR;
    end = mid + 3 * HOUR;
  }
  const pad = (end - start) * 0.03;
  return { t0: start - pad, t1: end + pad };
}

function packLanes(clusters: TimelineCluster[], x: (t: number) => number) {
  const items = clusters
    .map((c) => {
      const left = x(+new Date(c.start));
      const barWidth = Math.max(MIN_BAR_PX, x(+new Date(c.end)) - left);
      const labelWidth = c.label.length * 6.4 + 36; // rough text measure, enough to avoid label collisions
      return { c, left, barWidth, footprint: Math.max(barWidth, labelWidth) };
    })
    .sort((a, b) => b.c.count - a.c.count || a.left - b.left); // biggest stories take the top lanes

  const laneEnds: number[] = [];
  const placed = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end + 16 <= item.left);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.left + item.footprint;
    return { ...item, lane };
  });
  return { placed, laneCount: laneEnds.length };
}

function makeTicks(t0: number, t1: number) {
  const span = t1 - t0;
  const stepHours = span <= 12 * HOUR ? 1 : span <= 36 * HOUR ? 3 : span <= 4 * 24 * HOUR ? 6 : span <= 8 * 24 * HOUR ? 12 : 24;
  const first = new Date(t0);
  first.setMinutes(0, 0, 0);
  first.setHours(Math.floor(first.getHours() / stepHours) * stepHours);

  const ticks: { t: number; time: string; day: string | null }[] = [];
  for (let t = first.getTime(); t <= t1; t += stepHours * HOUR) {
    if (t < t0) continue;
    const d = new Date(t);
    const newDay = d.getHours() === 0 && d.getMinutes() === 0;
    ticks.push({
      t,
      time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      day: newDay || ticks.length === 0 ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null,
    });
  }
  return ticks;
}
