import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, categoryInputSchema, recordInputSchema, transactionInputSchema } from "..";

const base = { date: "2026-01-05", amount: 12.5, type: "expense", categoryId: "c1" };

describe("transactionInputSchema", () => {
  it("accepts a minimal transaction", () => {
    expect(transactionInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero amounts and bad dates", () => {
    expect(transactionInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, date: "01/05/2026" }).success).toBe(false);
  });

  it("requires an allocation to add up to 100", () => {
    const bad = { ...base, allocation: { programPct: 50, mgmtPct: 30, fundraisingPct: 10 } };
    const good = { ...base, allocation: { programPct: 50, mgmtPct: 40, fundraisingPct: 10 } };
    expect(transactionInputSchema.safeParse(bad).success).toBe(false);
    expect(transactionInputSchema.safeParse(good).success).toBe(true);
  });
});

describe("categories", () => {
  it("ships valid defaults with unique names", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(categoryInputSchema.safeParse(c).success, c.name).toBe(true);
    }
    const names = DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("recordInputSchema", () => {
  const base = { storagePath: "finance-records/u1/1-a-ledger.csv", fileName: "ledger.csv", label: "QB ledger", year: 2026 };

  it("accepts a record with or without notes", () => {
    expect(recordInputSchema.safeParse(base).success).toBe(true);
    expect(recordInputSchema.safeParse({ ...base, notes: "final export" }).success).toBe(true);
  });

  it("requires a label and a sensible year", () => {
    expect(recordInputSchema.safeParse({ ...base, label: "  " }).success).toBe(false);
    expect(recordInputSchema.safeParse({ ...base, year: 26 }).success).toBe(false);
  });
});
