import { describe, expect, it } from "vitest";
import {
  buildDedupeIndex,
  dateRange,
  findLikelyDuplicate as find,
  type ExistingTransaction,
  type IncomingTransaction,
} from "./dedupe";

const findLikelyDuplicate = (
  row: IncomingTransaction,
  existing: ExistingTransaction[],
  importBatch?: string,
) =>
  find(row, buildDedupeIndex(existing, (w, st) => st === "TN" && w === "CHATTANOOGA"), { importBatch });

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

describe("review fixes", () => {
  it("doesn't treat a shared city as a shared payee", () => {
    expect(
      findLikelyDuplicate(
        { date: "2026-10-03", amount: 40, type: "expense", vendor: "", description: "POS DEBIT SHELL OIL 4411 CHATTANOOGA TN" },
        [existing({ amount: 40, vendor: "", description: "EXXON 22 CHATTANOOGA TN" })],
      ),
    ).toBeNull();
  });

  it("ignores words common across what's on file", () => {
    const onFile = Array.from({ length: 6 }, (_, i) =>
      existing({ id: `c${i}`, amount: 10 + i, vendor: `${"ABCDEF"[i]}store Chattanooga` }),
    );
    onFile.push(existing({ id: "x", amount: 40, vendor: "Exxon Chattanooga" }));
    expect(
      find({ date: "2026-10-02", amount: 40, type: "expense", vendor: "Shell Chattanooga" }, buildDedupeIndex(onFile)),
    ).toBeNull();
  });

  it("matches one existing row to one incoming row", () => {
    const index = buildDedupeIndex([existing({ amount: 5, vendor: "", description: "SERVICE FEE BANK" })]);
    const claimed = new Set<string>();
    const fee = { date: "2026-10-01", amount: 5, type: "expense" as const, vendor: "", description: "SERVICE FEE BANK" };
    expect(find(fee, index, { claimed })).not.toBeNull();
    expect(find(fee, index, { claimed })).toBeNull();
  });

  it("keeps an anonymous gift apart from a named one on another day", () => {
    expect(
      findLikelyDuplicate(
        { date: "2026-10-03", amount: 25, type: "income", vendor: "", description: "Fall Gala" },
        [existing({ amount: 25, type: "income", vendor: "", description: "Fall Gala", donorName: "Carl D" })],
      ),
    ).toBeNull();
  });
});

describe("second review fixes", () => {
  const isCity = (words: string, state: string) => state === "TN" && words === "CHATTANOOGA";

  it("still catches a frequent payee", () => {
    const onFile = Array.from({ length: 10 }, (_, i) =>
      existing({ id: `k${i}`, amount: 10 + i, vendor: "Kroger", date: "2026-10-01" }),
    );
    onFile.push(existing({ id: "hand", amount: 42.5, vendor: "Kroger" }));
    const m = find(
      { date: "2026-10-03", amount: 42.5, type: "expense", vendor: "", description: "POS DEBIT KROGER #567 CHATTANOOGA TN" },
      buildDedupeIndex(onFile, isCity),
    );
    expect(m?.existing.id).toBe("hand");
  });

  it("only strips a real city, and never from a typed vendor", () => {
    const index = buildDedupeIndex([existing({ amount: 9, vendor: "Acme Supply Co", date: "2026-10-01" })], isCity);
    expect(
      find({ date: "2026-10-03", amount: 9, type: "expense", vendor: "", description: "SUPPLY ORDER 55 CO" }, index),
    ).not.toBeNull();
  });

  it("prefers a shared payee over a blank one at the same distance", () => {
    const m = findLikelyDuplicate(
      { date: "2026-10-02", amount: 20, type: "expense", vendor: "", description: "POS SHELL OIL" },
      [
        existing({ id: "blank", amount: 20, vendor: "", date: "2026-10-01" }),
        existing({ id: "shell", amount: 20, vendor: "Shell", date: "2026-10-01" }),
      ],
    );
    expect(m?.existing.id).toBe("shell");
  });

  it("ignores the file's own twin from an interrupted run", () => {
    expect(
      findLikelyDuplicate({ ...row, importKey: "k1" }, [existing({ importKey: "k1" })]),
    ).toBeNull();
  });
});
