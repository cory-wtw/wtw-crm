import { isoDateSchema } from "@/lib/schemas/finance";
import type { DateRange } from "./report";

/** Today in Chattanooga, as YYYY-MM-DD. The server runs in UTC. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type RangePreset = { label: string; from?: string; to?: string };

export function rangePresets(today: string): RangePreset[] {
  const year = Number(today.slice(0, 4));
  return [
    { label: "This year", from: `${year}-01-01`, to: `${year}-12-31` },
    { label: "Last year", from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "All time" },
  ];
}

/**
 * Reads ?from=&to= from a page's search params or a request URL. No params
 * at all means "this year"; `all=1` means every date. Garbage is ignored
 * rather than thrown, since these are hand-editable URLs.
 */
export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  today: string = todayIso(),
): DateRange & { all: boolean } {
  const pick = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && isoDateSchema.safeParse(s).success ? s : undefined;
  };
  const from = pick("from");
  const to = pick("to");
  if (params.all === "1") return { all: true };
  if (!from && !to) {
    const year = today.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31`, all: false };
  }
  return { from, to, all: false };
}

export function rangeQuery(range: DateRange): string {
  const q = new URLSearchParams();
  if (range.from) q.set("from", range.from);
  if (range.to) q.set("to", range.to);
  if (!range.from && !range.to) q.set("all", "1");
  return q.toString();
}

export function describeRange(range: DateRange): string {
  if (!range.from && !range.to) return "All time";
  if (range.from && range.to) {
    if (range.from.endsWith("-01-01") && range.to.endsWith("-12-31") &&
        range.from.slice(0, 4) === range.to.slice(0, 4)) {
      return `Calendar year ${range.from.slice(0, 4)}`;
    }
    return `${range.from} to ${range.to}`;
  }
  return range.from ? `From ${range.from}` : `Through ${range.to}`;
}
