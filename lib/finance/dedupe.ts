/**
 * Likely-duplicate detection for CSV imports. Pure functions, no I/O.
 *
 * The exact check (importIdentity → deterministic doc id) only catches a row
 * re-imported from the same kind of file with the same wording. The same
 * money also turns up entered by hand, from the QuickBooks ledger, or from a
 * bank export that words it differently or posts it a day later. This catches
 * those, aggressively: a near-match is held back and shown, never silently
 * written — and staff can pick which ones to import anyway.
 */

import { normalizeState } from "@/lib/zip-infer";
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
  /** importIdentity hash, minus the occurrence number. Twins from the same
   *  file share it and are told apart by occurrence, not by this check. */
  importKey?: string;
};

export type IncomingTransaction = {
  date: string;
  /** Signed, as it would be stored. */
  amount: number;
  type: "income" | "expense";
  vendor: string;
  description?: string;
  donorName?: string;
  importKey?: string;
};

/** The fields the check reads — select only these from Firestore. */
export const DEDUPE_FIELDS = [
  "date", "amount", "type", "vendor", "description", "donorName", "source", "importBatch", "importKey",
] as const;

/** A Firestore transaction doc as the check sees it. */
export function toExistingTransaction(
  id: string,
  t: Record<string, unknown>,
): ExistingTransaction {
  return {
    id,
    date: String(t.date ?? ""),
    amount: Number(t.amount ?? 0),
    type: t.type === "income" ? "income" : "expense",
    vendor: typeof t.vendor === "string" ? t.vendor : "",
    description: typeof t.description === "string" ? t.description : undefined,
    donorName: typeof t.donorName === "string" ? t.donorName : undefined,
    source: typeof t.source === "string" ? t.source : "manual",
    importBatch: typeof t.importBatch === "string" ? t.importBatch : undefined,
    importKey: typeof t.importKey === "string" ? t.importKey : undefined,
  };
}

/** A transaction about to be written, as the check sees it. */
export function toIncomingTransaction(t: Record<string, unknown>): IncomingTransaction {
  const e = toExistingTransaction("", t);
  return {
    date: e.date,
    amount: e.amount,
    type: e.type,
    vendor: e.vendor,
    description: e.description,
    donorName: e.donorName,
    importKey: e.importKey,
  };
}

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
  "ZEFFY", "GIFT", "TICKET", "TICKETS", "INC", "LLC", "THE", "AND",
]);

/** Whether a run of words is a city in a state — for stripping "… CITY ST". */
export type IsCity = (words: string, state: string) => boolean;

/**
 * Words that identify who was paid. Card descriptions end "… CITY ST", so a
 * known city before a trailing state code is dropped — "SHELL OIL
 * CHATTANOOGA TN" and "EXXON CHATTANOOGA TN" share a city, not a payee. Only
 * a real city is dropped ("ACME SUPPLY CO" keeps SUPPLY), and only from the
 * bank's description, never from a vendor name someone typed.
 */
function payeeWords(t: { vendor: string; description?: string }, isCity?: IsCity): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => {
    for (const w of normalizeVendorText(text).split(" ")) {
      if (w.length >= 3 && !GENERIC.has(w)) out.add(w);
    }
  };
  add(t.vendor);

  const tokens = (t.description ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
  while (tokens.length && /^\d+$/.test(tokens[tokens.length - 1])) tokens.pop();
  const state = tokens.length > 2 ? normalizeState(tokens[tokens.length - 1]) : null;
  if (state && isCity && tokens[tokens.length - 1].length === 2) {
    for (let len = Math.min(3, tokens.length - 2); len >= 1; len--) {
      const run = tokens.slice(-1 - len, -1).join(" ");
      if (isCity(run, state)) {
        tokens.splice(-1 - len, len + 1);
        break;
      }
    }
  }
  add(tokens.join(" "));
  return out;
}

type Prepared = ExistingTransaction & { cents: number; words: Set<string> };

/**
 * Existing transactions, normalized once and grouped by amount, plus the
 * words shared by many *different* payees on file — a city in typed vendor
 * names ("Exxon Chattanooga", "Shell Chattanooga") — which say nothing about
 * who was paid. A payee used often (ten Kroger receipts) is one payee and
 * stays meaningful.
 */
export type DedupeIndex = {
  byCents: Map<number, Prepared[]>;
  common: Set<string>;
  isCity?: IsCity;
};

/** Different payees sharing a word before it stops identifying anyone. */
const COMMON_ACROSS_PAYEES = 4;

export function buildDedupeIndex(
  existing: readonly ExistingTransaction[],
  isCity?: IsCity,
): DedupeIndex {
  const byCents = new Map<number, Prepared[]>();
  const payeesByWord = new Map<string, Set<string>>();
  for (const e of existing) {
    const p: Prepared = { ...e, cents: Math.round(e.amount * 100), words: payeeWords(e, isCity) };
    let bucket = byCents.get(p.cents);
    if (!bucket) byCents.set(p.cents, (bucket = []));
    bucket.push(p);
    const payee = [...p.words].sort().join(" ");
    for (const w of p.words) {
      let set = payeesByWord.get(w);
      if (!set) payeesByWord.set(w, (set = new Set()));
      set.add(payee);
    }
  }
  const common = new Set(
    [...payeesByWord].filter(([, payees]) => payees.size >= COMMON_ACROSS_PAYEES).map(([w]) => w),
  );
  return { byCents, common, isCity };
}

export type DuplicateMatch = { existing: ExistingTransaction; reason: string };

/**
 * The existing transaction this row most likely already is, or null.
 *
 * Same signed amount and type, and either within DATE_WINDOW_DAYS with a
 * shared payee word, or within a day when one side's wording can't say who was
 * paid ("CHECK 1043", a blank vendor). Two rows that each name a payee, and
 * name different ones, are different. For gifts, two different donors never
 * match, and a named gift only matches an unnamed one on the same day.
 *
 * `claimed` holds existing ids already matched in this import: one existing
 * transaction explains one incoming row, so two real $5 fees against one
 * hand-entered fee hold back one, not both. The match is added to it.
 */
export function findLikelyDuplicate(
  row: IncomingTransaction,
  index: DedupeIndex,
  options: { importBatch?: string; claimed?: Set<string> } = {},
): DuplicateMatch | null {
  const cents = Math.round(row.amount * 100);
  const mine = payeeWords(row, index.isCity);
  let best: DuplicateMatch | null = null;
  let bestDays = Infinity;
  let bestStrong = false;

  for (const e of index.byCents.get(cents) ?? []) {
    if (options.importBatch && e.importBatch === options.importBatch) continue;
    if (options.claimed?.has(e.id)) continue;
    // The file's own twin from an earlier, interrupted run of the same import.
    if (row.importKey && e.importKey === row.importKey) continue;
    if (e.type !== row.type) continue;
    const apart = days(row.date, e.date);
    // Nearest wins; at the same distance a shared payee beats no wording.
    if (apart > DATE_WINDOW_DAYS || apart > bestDays || (apart === bestDays && bestStrong)) continue;

    if (row.type === "income") {
      const a = row.donorName?.trim().toLowerCase();
      const b = e.donorName?.trim().toLowerCase();
      if (a && b && a !== b) continue;
      if ((a || b) && !(a && b) && apart > 0) continue;
    }

    const shared = [...e.words].some((w) => mine.has(w) && !index.common.has(w));
    const sameVendor =
      row.vendor.trim() !== "" && row.vendor.trim().toLowerCase() === e.vendor.trim().toLowerCase();
    if (shared || sameVendor) {
      best = {
        existing: e,
        reason: apart === 0 ? "same day, amount and payee" : `same amount and payee, ${apart} day${apart === 1 ? "" : "s"} apart`,
      };
      bestDays = apart;
      bestStrong = true;
    } else if (apart < bestDays && apart <= 1 && (mine.size === 0 || e.words.size === 0)) {
      best = { existing: e, reason: apart === 0 ? "same day and amount" : "same amount, a day apart" };
      bestDays = apart;
    }
  }
  if (best) options.claimed?.add(best.existing.id);
  return best;
}

/** The date range to load existing transactions for, padded by the window. */
export function dateRange(dates: readonly string[]): { from: string; to: string } {
  const sorted = [...dates].sort();
  const shift = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return { from: shift(sorted[0], -DATE_WINDOW_DAYS), to: shift(sorted[sorted.length - 1], DATE_WINDOW_DAYS) };
}
