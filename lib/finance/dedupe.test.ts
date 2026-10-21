import { describe, expect, it } from "vitest";
import { dateRange, findLikelyDuplicate, type ExistingTransaction } from "./dedupe";

const existing = (o: Partial<ExistingTransaction>): ExistingTransaction => ({
  id: "t1", date: "2026-10-01", amount: 42.5, type: "expense", vendor: "Kroger", source: "manual", ...o,
});
const row = { date: "2026-10-01", amount: 42.5, type: "expense" as const, vendor: "", description: "POS DEBIT 1234 KROGER #567 CHATTANOOGA TN" };

describe("findLikelyDuplicate", () => {
  it("catches the same charge entered by hand with different wording", () => {
    expect(findLikelyDuplicate(row, [existing({})])?.existing.id).toBe("t1");
  });

  it("catches a posting date a few days off when the payee matches", () => {
    expect(findLikelyDuplicate({ ...row, date: "2026-10-04" }, [existing({})])).not.toBeNull();
    expect(findLikelyDuplicate({ ...row, date: "2026-10-05" }, [existing({})])).toBeNull();
  });

  it("catches same amount a day apart even with no shared wording", () => {
    expect(
      findLikelyDuplicate({ ...row, date: "2026-10-02", description: "CHECK 1043" }, [existing({})]),
    ).not.toBeNull();
    expect(
      findLikelyDuplicate({ ...row, date: "2026-10-03", description: "CHECK 1043" }, [existing({})]),
    ).toBeNull();
  });

  it("never matches a different amount or direction", () => {
    expect(findLikelyDuplicate({ ...row, amount: 42.51 }, [existing({})])).toBeNull();
    expect(findLikelyDuplicate({ ...row, type: "income" }, [existing({})])).toBeNull();
  });

  it("ignores rows from the same import", () => {
    expect(findLikelyDuplicate(row, [existing({ importBatch: "b1" })], "b1")).toBeNull();
  });

  it("prefers the closest date", () => {
    const m = findLikelyDuplicate(row, [
      existing({ id: "far", date: "2026-10-03" }),
      existing({ id: "near", date: "2026-10-01" }),
    ]);
    expect(m?.existing.id).toBe("near");
  });
});

describe("dateRange", () => {
  it("pads by the window", () => {
    expect(dateRange(["2026-10-05", "2026-10-01"])).toEqual({ from: "2026-09-28", to: "2026-10-08" });
  });
});

describe("not too aggressive", () => {
  it("keeps two named payees apart even on the same day", () => {
    expect(
      findLikelyDuplicate({ ...row, description: "SHELL OIL 123" }, [existing({ vendor: "Exxon" })]),
    ).toBeNull();
  });

  it("keeps two different donors apart", () => {
    expect(
      findLikelyDuplicate(
        { date: "2026-10-01", amount: 25, type: "income", vendor: "", donorName: "Ann B" },
        [existing({ amount: 25, type: "income", vendor: "", donorName: "Carl D" })],
      ),
    ).toBeNull();
  });
});
