const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return usd.format(amount);
}

// Pinned to Eastern, where the team works. Without a timeZone the formatter
// uses the process's zone: UTC on the server, the staffer's own in the
// browser. A timestamp from a Chattanooga evening is then "Nov 3" on the
// server and "Nov 2" in the client, and React 418 (hydration text mismatch)
// fires on every client component that renders one. Keep every date
// formatter that runs in the browser on a fixed zone for the same reason.
const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

/** "Nov 3, 2026" from a timestamp, in Eastern time. Safe to render on both
 *  the server and the client. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return monthDay.format(date);
}

// For calendar dates stored as midnight or noon UTC — a `type="date"` input
// (`new Date("2026-05-15")`), or a YYYY-MM-DD the connector widened with
// `noonIfDateOnly`. Read in Eastern those land on the previous evening and
// show a day early, so this one formats in UTC, like formatShortDate.
const dateOnly = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "May 15, 2026" from a date-only value (encounter dates, due dates). Use
 *  formatDate for real timestamps like createdAt and updatedAt. */
export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateOnly.format(date);
}

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Dollars and cents — for the books, where rounding to the dollar hides things. */
export function formatUsdCents(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return usdCents.format(amount);
}

/** "Sep 22" from a YYYY-MM-DD date. UTC so the day never shifts by timezone. */
export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sep 2026" from a YYYY-MM month. */
export function formatMonth(yyyyMm: string): string {
  return new Date(`${yyyyMm}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
