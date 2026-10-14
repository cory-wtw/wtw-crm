"use client";

import { useState } from "react";
import { formatMonth } from "@/lib/format";

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export type Series = { key: string; label: string; color: string };

/**
 * Column chart for monthly data — one series, or two side by side. Plain
 * SVG: thin columns with rounded tops on a shared baseline, a recessive
 * grid, and a hover tooltip per month (the whole month's column of space is
 * the hit target, not just the bar).
 */
export function MonthColumns({
  data,
  series,
  format,
  label,
}: {
  data: ({ month: string } & Record<string, number | string>)[];
  series: Series[];
  /** How values read on the axis and in the tooltip. A string, not a
   *  function, because the page is a Server Component. */
  format: "usd" | "count";
  label: string;
}) {
  const fmt = format === "usd" ? (n: number) => compactUsd.format(n) : (n: number) => String(Math.round(n));
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const band = innerW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.min(28, (band * 0.6 - gap * (series.length - 1)) / series.length);
  const y = (v: number) => pad.top + innerH - (Math.max(0, v) / top) * innerH;

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
                {fmt(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.left + i * band + (band - (barW * series.length + gap * (series.length - 1))) / 2;
            return (
              <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill={hover === i ? "var(--viz-grid)" : "transparent"} />
                {series.map((s, j) => {
                  const v = Number(d[s.key]) || 0;
                  const h = Math.max(0, pad.top + innerH - y(v));
                  return h > 0 ? (
                    <path key={s.key} d={roundedTop(x0 + j * (barW + gap), y(v), barW, h, Math.min(4, barW / 2))} fill={s.color} />
                  ) : null;
                })}
                <text x={pad.left + i * band + band / 2} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {formatMonth(d.month).replace(/ \d{4}$/, "")}
                </text>
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-sm"
            style={{ left: `${((pad.left + hover * band + band / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            <p className="font-bold">{formatMonth(data[hover].month)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 tabular-nums">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                {s.label}: {fmt(Number(data[hover][s.key]) || 0)}
              </p>
            ))}
          </div>
        )}
      </div>
      {series.length > 1 && <Legend series={series} />}
    </figure>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** 3–5 round tick values from 0 up to just above max. */
function niceTicks(max: number): number[] {
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => max / s <= 4) ?? 10 * step;
  const out: number[] = [];
  for (let t = 0; t <= max + nice * 0.001; t += nice) out.push(Math.round(t * 100) / 100);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + nice);
  return out;
}
