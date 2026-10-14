import { normalizeVendorText, suggestVendorName } from "./bank-import";
import { inRange, type DateRange } from "./report";

/**
 * "What are we paying for?" — groups expenses by vendor, spots recurring
 * charges, and totals spending by month. Pure, so the Spending page and its
 * tests share one implementation.
 */

export type SpendTransaction = {
  id: string;
  date: string;
  vendor: string;
  description?: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string;
};

/** Normalized vendor key → display name the admin chose (merges and renames). */
export type VendorAliases = Record<string, string>;

export const NO_VENDOR = "(no vendor)";

/**
 * The grouping key for a transaction's vendor before aliases: the first two
 * meaningful words of the vendor name, or of the bank description when the
 * vendor is blank. Two words keeps "Amazon Web Services" apart from
 * "Amazon" while folding "POSTNET TN112" and "PostNet" together.
 */
export function rawVendorKey(tx: Pick<SpendTransaction, "vendor" | "description">): string {
  const words = normalizeVendorText(tx.vendor || tx.description || "")
    // A bounced or refunded charge ("Return for GUSTO - FEE …") belongs to
    // the vendor it reverses, so it nets against that vendor's total.
    .replace(/^RETURN FOR /, "")
    .split(" ")
    .filter(Boolean);
  return words.slice(0, 2).join(" ") || NO_VENDOR;
}

function displayName(tx: Pick<SpendTransaction, "vendor" | "description">): string {
  if (tx.vendor?.trim()) return tx.vendor.trim();
  const desc = tx.description?.replace(/^return for\s+/i, "").trim();
  if (desc) return suggestVendorName(desc) || desc;
  return NO_VENDOR;
}

export function vendorName(
  tx: Pick<SpendTransaction, "vendor" | "description">,
  aliases: VendorAliases,
): string {
  return aliases[rawVendorKey(tx)] ?? displayName(tx);
}

export type VendorSummary = {
  name: string;
  /** Raw keys folded into this vendor — what a merge/rename writes against. */
  keys: string[];
  total: number;
  count: number;
  first: string;
  last: string;
  /** Category id with the most spend for this vendor. */
  mainCategoryId: string;
  transactionIds: string[];
};

const cents = (n: number) => Math.round(n * 100);

/** Vendors by net spend (refunds included), largest first. Expenses only. */
export function summarizeVendors(
  transactions: readonly SpendTransaction[],
  aliases: VendorAliases,
  range: DateRange = {},
): VendorSummary[] {
  type Acc = {
    keys: Set<string>;
    names: Map<string, number>;
    cents: number;
    count: number;
    first: string;
    last: string;
    byCat: Map<string, number>;
    ids: string[];
  };
  const groups = new Map<string, Acc>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || !inRange(tx.date, range)) continue;
    const key = rawVendorKey(tx);
    const alias = aliases[key];
    // Group by alias when there is one, otherwise by raw key, so two keys
    // aliased to the same name land together.
    const groupId = alias ? `alias:${alias.toLowerCase()}` : `key:${key}`;
    const acc: Acc = groups.get(groupId) ?? {
      keys: new Set<string>(),
      names: new Map<string, number>(),
      cents: 0,
      count: 0,
      first: tx.date,
      last: tx.date,
      byCat: new Map<string, number>(),
      ids: [],
    };
    const name = alias ?? displayName(tx);
    acc.keys.add(key);
    acc.names.set(name, (acc.names.get(name) ?? 0) + 1);
    acc.cents += cents(tx.amount);
    acc.count += 1;
    if (tx.date < acc.first) acc.first = tx.date;
    if (tx.date > acc.last) acc.last = tx.date;
    acc.byCat.set(tx.categoryId, (acc.byCat.get(tx.categoryId) ?? 0) + Math.abs(cents(tx.amount)));
    acc.ids.push(tx.id);
    groups.set(groupId, acc);
  }
  return [...groups.values()]
    .map((a) => ({
      // Most common spelling wins as the label.
      name: [...a.names.entries()].sort((x, y) => y[1] - x[1])[0][0],
      keys: [...a.keys],
      total: a.cents / 100,
      count: a.count,
      first: a.first,
      last: a.last,
      mainCategoryId: [...a.byCat.entries()].sort((x, y) => y[1] - x[1])[0][0],
      transactionIds: a.ids,
    }))
    .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
}

export type RecurringCharge = {
  name: string;
  mainCategoryId: string;
  /** Average of the last three calendar months that had charges. */
  monthly: number;
  lastDate: string;
  lastAmount: number;
  monthsCharged: number;
  active: boolean;
};

/**
 * A recurring charge counts as stopped once it has gone quiet for 1.5× its
 * usual gap between charges — 45 days for a monthly bill, about three weeks
 * for biweekly payroll, ten days for near-daily ad spend — clamped so a
 * monthly bill that's a few days late isn't flagged.
 */
export const QUIET_MULTIPLIER = 1.5;
const MIN_QUIET_DAYS = 14;
const BILL_SPREAD = 4;
/** Charges this close together count as one billing date. */
const SAME_BILLING_DAYS = 3;
const MAX_QUIET_DAYS = 60;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function monthsApart(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * A vendor is recurring when it charged in at least three calendar months,
 * at least two of them back to back. That catches subscriptions, insurance
 * and regular contractors while skipping one-off purchases that happen to
 * repeat (two Walmart runs months apart). Looks at all history, not just the
 * selected range — "is this still billing us?" is about now.
 */
export function findRecurring(
  transactions: readonly SpendTransaction[],
  aliases: VendorAliases,
  today: string,
): RecurringCharge[] {
  const vendors = summarizeVendors(transactions, aliases);
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const out: RecurringCharge[] = [];
  for (const v of vendors) {
    const txs = v.transactionIds.map((id) => byId.get(id)!).sort((a, b) => a.date.localeCompare(b.date));
    const monthTotals = new Map<string, number>();
    for (const t of txs) {
      const m = t.date.slice(0, 7);
      monthTotals.set(m, (monthTotals.get(m) ?? 0) + cents(t.amount));
    }
    // Months with an actual charge — a month holding only a refund doesn't
    // make something a monthly bill.
    const months = [...new Set(txs.filter((t) => t.amount > 0).map((t) => t.date.slice(0, 7)))].sort();
    const adjacent = months.slice(1).filter((m, i) => monthsApart(`${months[i]}-01`, `${m}-01`) === 1).length;
    const charges = txs.filter((t) => t.amount > 0);
    // Or: newer, more frequent billing (a loan repaid every two weeks) that
    // hasn't spanned three months yet — four or more charges, never more
    // than ~a month apart.
    const gaps = charges.slice(1).map((t, i) => daysBetween(charges[i].date, t.date));
    const frequent = charges.length >= 4 && months.length >= 2 && gaps.every((g) => g <= 35);
    if (!((months.length >= 3 && adjacent >= 2) || frequent)) continue;
    // Bills vary within a band; shopping doesn't. Skip a vendor whose
    // biggest month is more than BILL_SPREAD times its typical month (a $600
    // Walmart run next to a $1.61 one).
    const positiveMonths = [...monthTotals.values()].filter((c) => c > 0);
    if (positiveMonths.length && Math.max(...positiveMonths) > BILL_SPREAD * median(positiveMonths)) continue;

    const recent = months.slice(-3).map((m) => monthTotals.get(m)!);
    const last = charges.at(-1) ?? txs.at(-1)!;
    // Gaps between billing dates. Charges within a few days of each other
    // are one billing date — two loans repaid on alternate days, or an
    // invoice and its tax line — so they don't shrink the usual gap.
    const days: string[] = [];
    for (const t of charges) {
      if (!days.length || daysBetween(days[days.length - 1], t.date) > SAME_BILLING_DAYS) days.push(t.date);
    }
    const dayGaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const usualGap = dayGaps.length ? median(dayGaps) : 30;
    const quietLimit = Math.min(MAX_QUIET_DAYS, Math.max(MIN_QUIET_DAYS, usualGap * QUIET_MULTIPLIER));
    out.push({
      name: v.name,
      mainCategoryId: v.mainCategoryId,
      monthly: Math.round(recent.reduce((s, c) => s + c, 0) / recent.length) / 100,
      lastDate: last.date,
      lastAmount: last.amount,
      monthsCharged: months.length,
      active: daysBetween(last.date, today) <= quietLimit,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly);
}

export type MonthSpend = {
  month: string;
  total: number;
  byCategory: Record<string, number>;
};

/** Expense totals per calendar month in the range, oldest first. */
export function spendByMonth(
  transactions: readonly SpendTransaction[],
  range: DateRange = {},
): MonthSpend[] {
  const months = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || !inRange(tx.date, range)) continue;
    const m = tx.date.slice(0, 7);
    const cats = months.get(m) ?? new Map<string, number>();
    cats.set(tx.categoryId, (cats.get(tx.categoryId) ?? 0) + cents(tx.amount));
    months.set(m, cats);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cats]) => ({
      month,
      total: [...cats.values()].reduce((s, c) => s + c, 0) / 100,
      byCategory: Object.fromEntries([...cats.entries()].map(([k, c]) => [k, c / 100])),
    }));
}
