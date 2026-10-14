import { toCsv } from "./csv";
import {
  effectiveAllocation,
  inRange,
  splitCents,
  type DateRange,
  type ProfitAndLoss,
} from "./report";
import {
  TRANSACTION_SOURCE_LABELS,
  type Category,
  type Transaction,
} from "@/lib/schemas/finance";

const money = (n: number) => n.toFixed(2);

export function pnlCsv(pnl: ProfitAndLoss, periodLabel: string): string {
  const rows: unknown[][] = [
    ["Worth Their Weight — Profit & Loss"],
    ["Period", periodLabel],
    [],
    ["Section", "Category", "Transactions", "Total", "Program", "Management & general", "Fundraising"],
  ];
  for (const l of pnl.income) {
    rows.push(["Revenue", l.name, l.count, money(l.total)]);
  }
  rows.push(["Revenue", "Total revenue", "", money(pnl.totalIncome)]);
  for (const l of pnl.expenses) {
    rows.push(["Expenses", l.name, l.count, money(l.total), money(l.program), money(l.mgmt), money(l.fundraising)]);
  }
  rows.push([
    "Expenses",
    "Total expenses",
    "",
    money(pnl.totalExpenses),
    money(pnl.functional.program),
    money(pnl.functional.mgmt),
    money(pnl.functional.fundraising),
  ]);
  rows.push(
    [],
    ["Net", "Revenue less expenses", "", money(pnl.net)],
    ["990-N", "Gross receipts", "", money(pnl.grossReceipts)],
    [
      "Functional %",
      "Share of total expenses",
      "",
      "",
      `${pnl.functional.programPct}%`,
      `${pnl.functional.mgmtPct}%`,
      `${pnl.functional.fundraisingPct}%`,
    ],
  );
  return toCsv(rows);
}

export function transactionsCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  range: DateRange,
): string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows: unknown[][] = [
    [
      "Date", "Type", "Category", "Vendor", "Description", "Donor", "Campaign",
      "Amount", "Program %", "Management %", "Fundraising %",
      "Program $", "Management $", "Fundraising $", "Split", "Source", "Notes",
    ],
  ];
  const sorted = transactions
    .filter((t) => inRange(t.date, range))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    const category = byId.get(t.categoryId);
    const isExpense = t.type === "expense";
    const a = effectiveAllocation(t, category);
    const [p, m, f] = isExpense ? splitCents(Math.round(t.amount * 100), a) : [0, 0, 0];
    rows.push([
      t.date,
      isExpense ? "Expense" : "Income",
      category?.name ?? "Uncategorized",
      t.vendor,
      t.description ?? "",
      t.donorName ?? "",
      t.campaign ?? "",
      money(t.amount),
      isExpense ? a.programPct : "",
      isExpense ? a.mgmtPct : "",
      isExpense ? a.fundraisingPct : "",
      isExpense ? money(p / 100) : "",
      isExpense ? money(m / 100) : "",
      isExpense ? money(f / 100) : "",
      isExpense ? (t.allocation ? "Custom" : "Category default") : "",
      TRANSACTION_SOURCE_LABELS[t.source],
      t.notes ?? "",
    ]);
  }
  return toCsv(rows);
}
