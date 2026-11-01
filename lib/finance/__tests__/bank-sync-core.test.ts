import { describe, expect, it } from "vitest";
import { buildVendorIndex } from "../bank-import";
import {
  MAX_HISTORY_DAYS,
  bankTransactionDoc,
  earliestSyncFrom,
  findBankDuplicate,
  routeBankRow,
} from "../bank-sync-core";
import { buildDedupeIndex, type ExistingTransaction } from "../dedupe";

const row = {
  syncId: "sf_000000000000000000000001",
  accountId: "acct1",
  bankTxnId: "t1",
  date: "2026-10-20",
  description: "UBER *TRIP HELP.UBER.COM",
  amount: 23.4,
  type: "expense" as const,
};

const existing = (over: Partial<ExistingTransaction>): ExistingTransaction => ({
  id: "x1",
  date: "2026-10-20",
  amount: 23.4,
  type: "expense",
  vendor: "Uber",
  description: "UBER TRIP",
  source: "bank_csv",
  ...over,
});

const categories = new Map([
  ["rides", { id: "rides", type: "expense" as const }],
  ["gifts", { id: "gifts", type: "income" as const }],
]);
const vendors = buildVendorIndex([{ vendor: "Uber", description: "UBER TRIP", categoryId: "rides", type: "expense" }]);

describe("bankTransactionDoc", () => {
  it("files a debit under an expense category as a positive expense", () => {
    const d = bankTransactionDoc(row, { vendor: "Uber", categoryId: "rides", type: "expense" }, "u1", new Date(0), "b");
    expect(d).toMatchObject({ amount: 23.4, type: "expense", source: "bank_sync", bankTxnId: "t1", importKey: row.syncId });
  });
  it("files money in under an expense category as a refund (negative)", () => {
    const d = bankTransactionDoc({ ...row, type: "income", amount: 10.005 }, { vendor: "Uber", categoryId: "rides", type: "expense" }, "u1", new Date(0), "b");
    expect(d).toMatchObject({ amount: -10.01, type: "expense" });
  });
});

describe("findBankDuplicate", () => {
  it("matches the same charge on file", () => {
    const idx = buildDedupeIndex([existing({})]);
    expect(findBankDuplicate(row, "Uber", idx)?.existing.id).toBe("x1");
  });
  it("matches a bank deposit to a refund already filed as a negative expense", () => {
    const idx = buildDedupeIndex([existing({ amount: -23.4, type: "expense" })]);
    expect(findBankDuplicate({ ...row, type: "income" }, "Uber", idx)?.existing.id).toBe("x1");
  });
  it("ignores a different amount", () => {
    const idx = buildDedupeIndex([existing({ amount: 23.41 })]);
    expect(findBankDuplicate(row, "Uber", idx)).toBeNull();
  });
});

describe("routeBankRow", () => {
  it("sends a known vendor with nothing similar on file to the books", () => {
    const r = routeBankRow(row, vendors, categories, buildDedupeIndex([]));
    expect(r).toEqual({ to: "books", vendor: "Uber", categoryId: "rides", type: "expense" });
  });
  it("holds a known vendor that looks already on file", () => {
    const r = routeBankRow(row, vendors, categories, buildDedupeIndex([existing({})]));
    expect(r).toMatchObject({ to: "inbox", suggestedCategoryId: "rides" });
    expect(r.to === "inbox" && r.duplicateOf?.existing.id).toBe("x1");
  });
  it("holds a new vendor with a suggested name", () => {
    const r = routeBankRow({ ...row, description: "SQ *JOES COFFEE 0423 CHATTANOOGA TN" }, vendors, categories, buildDedupeIndex([]));
    expect(r).toMatchObject({ to: "inbox", suggestedCategoryId: null, duplicateOf: null });
    expect(r.vendor).toMatch(/Joes Coffee/);
  });
});

describe("earliestSyncFrom", () => {
  it("is a year back", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(earliestSyncFrom(now)).toBe(new Date(now.getTime() - MAX_HISTORY_DAYS * 86400_000).toISOString().slice(0, 10));
  });
});
