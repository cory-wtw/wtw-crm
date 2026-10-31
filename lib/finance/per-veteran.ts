import { formatShortName } from "@/lib/name";

/**
 * "What have we spent on each veteran?" — expenses linked to a veteran, summed
 * per person. Pure, so the Spending page, the veteran page and their tests
 * share one implementation.
 */

export type VeteranSpendTransaction = {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  veteranId?: string;
};

export type VeteranSpend = {
  veteranId: string;
  total: number;
  count: number;
  /** Most recent linked expense, YYYY-MM-DD. */
  lastDate: string;
};

/**
 * Totals per veteran, biggest first. Refunds (negative amounts) net against
 * the veteran they were for. Summed in cents so 0.1 + 0.2 stays 0.30.
 */
export function spendByVeteran(transactions: readonly VeteranSpendTransaction[]): VeteranSpend[] {
  const by = new Map<string, { cents: number; count: number; lastDate: string }>();
  for (const t of transactions) {
    if (t.type !== "expense" || !t.veteranId) continue;
    const row = by.get(t.veteranId) ?? { cents: 0, count: 0, lastDate: "" };
    row.cents += Math.round(t.amount * 100);
    row.count += 1;
    if (t.date > row.lastDate) row.lastDate = t.date;
    by.set(t.veteranId, row);
  }
  return [...by.entries()]
    .map(([veteranId, r]) => ({ veteranId, total: r.cents / 100, count: r.count, lastDate: r.lastDate }))
    .sort((a, b) => b.total - a.total || a.veteranId.localeCompare(b.veteranId));
}

/** The expenses linked to one veteran, newest first. */
export function expensesForVeteran<T extends VeteranSpendTransaction>(
  transactions: readonly T[],
  veteranId: string,
): T[] {
  return transactions
    .filter((t) => t.type === "expense" && t.veteranId === veteranId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Veterans as picker options, by name. */
export function veteranOptions(
  veterans: readonly { id: string; firstName: string; lastInitial?: string }[],
): { id: string; label: string }[] {
  return veterans
    .map((v) => ({ id: v.id, label: formatShortName(v.firstName, v.lastInitial) || "(no name)" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
