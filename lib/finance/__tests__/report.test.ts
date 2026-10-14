import { describe, expect, it } from "vitest";
import type { Category } from "@/lib/schemas/finance";
import { buildProfitAndLoss, splitCents, type ReportTransaction } from "../report";

const categories: Category[] = [
  { id: "don", name: "Donations", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { id: "sw", name: "Software", type: "expense", defaultProgramPct: 60, defaultMgmtPct: 30, defaultFundraisingPct: 10 },
  { id: "fees", name: "Fees", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 100, defaultFundraisingPct: 0 },
];

const tx = (t: Partial<ReportTransaction>): ReportTransaction => ({
  date: "2026-03-01",
  amount: 0,
  type: "expense",
  categoryId: "sw",
  ...t,
});

describe("splitCents", () => {
  it("never loses a penny", () => {
    const [p, m, f] = splitCents(1001, { programPct: 33.3, mgmtPct: 33.3, fundraisingPct: 33.4 });
    expect(p + m + f).toBe(1001);
  });
});

describe("buildProfitAndLoss", () => {
  const rows = [
    tx({ type: "income", categoryId: "don", amount: 750 }),
    tx({ type: "income", categoryId: "don", amount: 0.1 }),
    tx({ type: "income", categoryId: "don", amount: 0.2 }),
    tx({ type: "income", categoryId: "don", amount: -50, date: "2026-03-02" }), // refund
    tx({ amount: 100 }), // default 60/30/10
    tx({ amount: 100, allocation: { programPct: 100, mgmtPct: 0, fundraisingPct: 0 } }),
    tx({ amount: -20 }), // vendor refund
    tx({ amount: 30, categoryId: "fees" }),
    tx({ amount: 999, date: "2025-12-31" }), // out of range
  ];
  const pnl = buildProfitAndLoss(rows, categories, { from: "2026-01-01", to: "2026-12-31" });

  it("totals income and expenses in cents", () => {
    expect(pnl.totalIncome).toBe(700.3);
    expect(pnl.totalExpenses).toBe(210);
    expect(pnl.net).toBe(490.3);
  });

  it("nets refunds out of gross receipts", () => {
    expect(pnl.grossReceipts).toBe(700.3);
  });

  it("applies category defaults unless a transaction overrides them", () => {
    const sw = pnl.expenses.find((l) => l.categoryId === "sw")!;
    // 100 @ 60/30/10 + 100 @ 100/0/0 − 20 @ 60/30/10
    expect(sw.total).toBe(180);
    expect(sw.program).toBe(60 + 100 - 12);
    expect(sw.mgmt).toBe(30 - 6);
    expect(sw.fundraising).toBe(10 - 2);
  });

  it("reports the functional split as a share of expenses", () => {
    expect(pnl.functional.program + pnl.functional.mgmt + pnl.functional.fundraising).toBe(210);
    expect(pnl.functional.programPct).toBe(70.5);
  });

  it("treats rows with a deleted category as overhead", () => {
    const orphan = buildProfitAndLoss([tx({ amount: 10, categoryId: "gone" })], categories);
    expect(orphan.expenses[0].name).toBe("Uncategorized");
    expect(orphan.functional.mgmt).toBe(10);
  });
});
