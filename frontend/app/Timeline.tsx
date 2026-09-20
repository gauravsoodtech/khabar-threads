"use client";

import { useEffect, useRef, useState } from "react";
import { fmtTime, sourceColor, type TimelineCluster } from "./api";

// One ribbon per story, from its first article to its latest, on a shared axis.
// Ribbons that would overlap go into separate lanes; the biggest stories get the top lanes.

const AXIS_H = 54;
const LANE_H = 66;
const MIN_BAR_PX = 16;
const HOUR = 3_600_000;

type Props = {
  clusters: TimelineCluster[];
  now: number; // when the data was generated, drawn as the "abhi" marker
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function TimelineChart({ clusters, now, selectedId, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverId, setHoverId] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { t0, t1 } = timeRange(clusters);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * width;
  const { placed, laneCount } = packLanes(clusters, x, width);
  const ticks = makeTicks(t0, t1);
  const biggest = Math.max(...clusters.map((c) => c.count));

  return (
    <div className="overflow-x-auto">
      <div ref={ref} className="relative min-w-[760px]" style={{ height: AXIS_H + laneCount * LANE_H + 96 }}>
        {width > 0 && (
          <>
            <div className="absolute inset-x-0 top-0 border-b-[3px] border-ink" style={{ height: AXIS_H }} />

            {ticks.map((tick) => (
              <div key={tick.t} className="absolute top-0 bottom-0 border-l border-dashed border-ink/25" style={{ left: x(tick.t) }}>
                <span className="absolute top-1.5 left-1.5 font-num text-xl leading-none whitespace-nowrap text-ink/70">{tick.time}</span>
                {tick.day && (
                  <span className="absolute top-[30px] left-1.5 font-sans text-[11px] leading-none font-bold tracking-wider whitespace-nowrap text-ink uppercase">
                    {tick.day}
                  </span>
                )}
              </div>
            ))}

            {now >= t0 && now <= t1 && (
              <div className="absolute top-0 bottom-0 z-10 border-l-[3px] border-kumkum" style={{ left: x(now) }}>
                <span className="absolute top-1 left-0 bg-kumkum px-1.5 py-0.5 font-num text-base leading-none tracking-widest text-paper uppercase">
                  abhi
                </span>
              </div>
            )}

            {placed.map(({ c, lane, left, barWidth, labelLeft }) => {
              const barH = 14 + Math.round(c.intensity * 14);
              const laneTop = AXIS_H + lane * LANE_H;
              const selected = c.id === selectedId;
              const fill = `color-mix(in oklab, var(--color-haldi), var(--color-rani) ${Math.round(c.intensity * 100)}%)`;
              return (
                <div key={c.id} className="absolute" style={{ left, top: laneTop, height: LANE_H, width: Math.max(barWidth, 8) }}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    onMouseEnter={() => setHoverId(c.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(c.id)}
                    onBlur={() => setHoverId(null)}
                    className="group block h-full w-full text-left focus:outline-none"
                  >
                    <span
                      className={`absolute top-3 font-sans text-[13px] leading-none font-semibold whitespace-nowrap ${
                        selected ? "bg-ink px-1 text-paper" : "text-ink"
                      }`}
                      style={{ left: labelLeft - left }}
                    >
                      {c.label}
                      <span className={`ml-1.5 font-num text-base ${selected ? "text-paper/70" : "text-ink/60"}`}>{c.count}</span>
                      {c.count === biggest && clusters.length > 1 && (
                        <span className="sticker pop ml-2 -rotate-3 bg-kumkum px-1.5 py-0.5 font-num text-xs leading-none tracking-widest text-paper uppercase">
                          top thread
                        </span>
                      )}
                    </span>
                    <span
                      className={`thread absolute left-0 block border-2 border-ink ${selected ? "ring-[3px] ring-ink ring-offset-2 ring-offset-paper" : ""}`}
                      style={{
                        top: 34 + (28 - barH) / 2,
                        height: barH,
                        width: barWidth,
                        background: fill,
                        boxShadow: "3px 3px 0 0 var(--color-ink)",
                        animationDelay: `${lane * 70}ms`,
                      }}
                    >
                      {c.points.map((p, i) => (
                        <span
                          key={i}
                          className="bead absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink"
                          style={{
                            left: clamp(x(+new Date(p.t)) - left, 5, barWidth - 5),
                            background: sourceColor(p.source),
                            animationDelay: `${lane * 70 + 400 + i * 30}ms`,
                          }}
                        />
                      ))}
                    </span>
                  </button>

                  {hoverId === c.id && (
                    <div
                      className="pointer-events-none absolute z-20 w-72 border-[3px] border-ink bg-paper p-3 shadow-hard"
                      style={{ left: labelLeft - left, top: LANE_H - 2 }}
                    >
                      <p className="font-sans text-sm leading-snug font-semibold text-ink">{c.latest_title}</p>
                      <p className="mt-1.5 font-num text-lg leading-none text-ink/70">
                        {c.count} articles · {fmtTime(c.start)} to {fmtTime(c.end)}
                      </p>
                    </div>
                  )}
                </div>
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
    const mid = (start + end) / 2;
    start = mid - 3 * HOUR;
    end = mid + 3 * HOUR;
  }
  const pad = (end - start) * 0.03;
  return { t0: start - pad, t1: end + pad };
}

function packLanes(clusters: TimelineCluster[], x: (t: number) => number, width: number) {
  const biggest = Math.max(...clusters.map((c) => c.count));
  const items = clusters
    .map((c) => {
      const left = x(+new Date(c.start));
      const barWidth = Math.max(MIN_BAR_PX, x(+new Date(c.end)) - left);
      const labelWidth = c.label.length * 7 + (c.count === biggest ? 130 : 44); // rough text measure, the top thread carries a sticker
      const labelLeft = clamp(left, 0, Math.max(0, width - labelWidth)); // slide left instead of clipping
      const from = Math.min(left, labelLeft);
      const to = Math.max(left + barWidth, labelLeft + labelWidth);
      return { c, left, barWidth, labelLeft, from, to };
    })
    .sort((a, b) => b.c.count - a.c.count || a.from - b.from);

  const laneEnds: number[] = [];
  const placed = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end + 18 <= item.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.to;
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
      time: d.toLocaleTimeString(undefined, { hour: "numeric" }),
      day: newDay || ticks.length === 0 ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null,
    });
  }
  return ticks;
}
