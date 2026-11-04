import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Today as YYYY-MM-DD in Eastern time — the default for a date input.
 *  Fixed to the team's zone (like lib/finance/range.ts) so the server and
 *  the browser agree on the default and hydration stays clean. */
export function localTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** A typed dollar amount as a positive number, or undefined for blank,
 *  zero, negative or garbage. */
export function positiveAmount(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
