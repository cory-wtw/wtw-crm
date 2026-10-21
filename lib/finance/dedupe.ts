/**
 * Likely-duplicate detection for CSV imports. Pure functions, no I/O.
 *
 * The exact check (importIdentity → deterministic doc id) only catches a row
 * re-imported from the same kind of file with the same wording. The same
 * money also turns up entered by hand, from the QuickBooks ledger, or from a
 * bank export that words it differently or posts it a day later. This catches
 * those, aggressively: a near-match is held back and shown, never silently
 * written — and staff can import it anyway with one tap.
 */

import { normalizeVendorText } from "./bank-import";

export type ExistingTransaction = {
  id: string;
  date: string;
  /** Signed, as stored. */
  amount: number;
  type: "income" | "expense";
  vendor: string;
  description?: string;
  donorName?: string;
  source: string;
  /** Rows from the import in progress don't count against each other. */
  importBatch?: string;
};

export type IncomingTransaction = {
  date: string;
  /** Signed, as it would be stored. */
  amount: number;
  type: "income" | "expense";
  vendor: string;
  description?: string;
  donorName?: string;
};

/** Days a bank and a person can disagree on: posting lag, weekends. */
export const DATE_WINDOW_DAYS = 3;

function days(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Words that say how money moved, not who it went to. */
const GENERIC = new Set([
  "CHECK", "CHK", "DEPOSIT", "TRANSFER", "XFER", "PAYMENT", "PMT", "DEBIT",
  "CREDIT", "WITHDRAWAL", "ONLINE", "ACH", "POS", "PURCHASE", "CARD", "ZELLE",
  "VENMO", "PAYPAL", "WIRE", "FEE", "MOBILE", "ATM", "REFUND", "DONATION",
]);

/** Words that identify who was paid — boilerplate and short words dropped. */
function words(t: { vendor: string; description?: string }): Set<string> {
  return new Set(
    normalizeVendorText(`${t.vendor} ${t.description ?? ""}`)
      .split(" ")
      .filter((w) => w.length >= 3 && !GENERIC.has(w)),
  );
}

export type DuplicateMatch = { existing: ExistingTransaction; reason: string };

/**
 * The existing transaction this row most likely already is, or null.
 *
 * Same signed amount and type, and either within DATE_WINDOW_DAYS with a
 * shared payee word, or within a day when one side's wording can't say who was
 * paid ("CHECK 1043", a blank vendor). Two rows that each name a payee, and
 * name different ones, are different — and so are two different donors.
 */
export function findLikelyDuplicate(
  row: IncomingTransaction,
  existing: readonly ExistingTransaction[],
  importBatch?: string,
): DuplicateMatch | null {
  const cents = Math.round(row.amount * 100);
  const mine = words(row);
  let best: DuplicateMatch | null = null;
  let bestDays = Infinity;

  for (const e of existing) {
    if (importBatch && e.importBatch === importBatch) continue;
    if (e.type !== row.type || Math.round(e.amount * 100) !== cents) continue;
    const apart = days(row.date, e.date);
    if (apart > DATE_WINDOW_DAYS || apart >= bestDays) continue;

    if (row.donorName && e.donorName && row.donorName.trim().toLowerCase() !== e.donorName.trim().toLowerCase()) {
      continue;
    }
    const theirs = words(e);
    const shared = [...theirs].some((w) => mine.has(w));
    const sameVendor =
      row.vendor.trim() !== "" && row.vendor.trim().toLowerCase() === e.vendor.trim().toLowerCase();
    if (shared || sameVendor) {
      best = { existing: e, reason: apart === 0 ? "same day, amount and payee" : `same amount and payee, ${apart} day${apart === 1 ? "" : "s"} apart` };
      bestDays = apart;
    } else if (apart <= 1 && (mine.size === 0 || theirs.size === 0)) {
      best = { existing: e, reason: apart === 0 ? "same day and amount" : "same amount, a day apart" };
      bestDays = apart;
    }
  }
  return best;
}

/** The date range to load existing transactions for, padded by the window. */
export function dateRange(dates: readonly string[]): { from: string; to: string } {
  const sorted = [...dates].sort();
  const shift = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return { from: shift(sorted[0], -DATE_WINDOW_DAYS), to: shift(sorted[sorted.length - 1], DATE_WINDOW_DAYS) };
}
