import { describe, expect, it } from "vitest";
import { expensesForVeteran, spendByVeteran, veteranOptions } from "../per-veteran";

const tx = (o: Partial<Parameters<typeof spendByVeteran>[0][number]>) => ({
  id: "t",
  date: "2026-10-01",
  amount: 10,
  type: "expense" as const,
  ...o,
});

describe("spendByVeteran", () => {
  it("sums linked expenses per veteran, biggest first", () => {
    const rows = spendByVeteran([
      tx({ veteranId: "robin", amount: 60, date: "2026-10-03" }),
      tx({ veteranId: "robin", amount: 0.1 }),
      tx({ veteranId: "robin", amount: 0.2 }),
      tx({ veteranId: "sam", amount: 100 }),
      // A refund nets against the veteran it was for.
      tx({ veteranId: "sam", amount: -25 }),
      // Not linked, or income: ignored.
      tx({ amount: 500 }),
      tx({ veteranId: "robin", type: "income", amount: 1000 }),
    ]);
    expect(rows).toEqual([
      { veteranId: "sam", total: 75, count: 2, lastDate: "2026-10-01" },
      { veteranId: "robin", total: 60.3, count: 3, lastDate: "2026-10-03" },
    ]);
  });
});

describe("expensesForVeteran", () => {
  it("returns that veteran's expenses, newest first", () => {
    const rows = expensesForVeteran(
      [
        tx({ id: "a", veteranId: "robin", date: "2026-09-01" }),
        tx({ id: "b", veteranId: "robin", date: "2026-10-01" }),
        tx({ id: "c", veteranId: "sam" }),
      ],
      "robin",
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("veteranOptions", () => {
  it("labels with the short name, sorted", () => {
    expect(
      veteranOptions([
        { id: "2", firstName: "Sam", lastInitial: "t" },
        { id: "1", firstName: "Robin", lastInitial: "C" },
      ]),
    ).toEqual([
      { id: "1", label: "Robin C." },
      { id: "2", label: "Sam T." },
    ]);
  });
});
