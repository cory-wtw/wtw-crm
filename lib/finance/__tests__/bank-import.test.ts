import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import {
  NO_COLUMN,
  buildVendorIndex,
  detectColumns,
  extractRows,
  importIdentity,
  isZeffyPayout,
  matchVendor,
  normalizeVendorText,
  suggestVendorName,
} from "../bank-import";

describe("detectColumns", () => {
  it("finds a signed amount layout", () => {
    const map = detectColumns(["Posting Date", "Description", "Amount", "Balance"], "bank");
    expect(map).toMatchObject({ date: 0, description: 1, amount: 2, debit: NO_COLUMN, credit: NO_COLUMN });
  });

  it("finds a debit/credit layout", () => {
    const map = detectColumns(["Date", "Payee", "Withdrawal", "Deposit"], "bank");
    expect(map).toMatchObject({ date: 0, description: 1, amount: NO_COLUMN, debit: 2, credit: 3 });
  });

  it("doesn't let the description grab the donor name in Zeffy exports", () => {
    const map = detectColumns(
      ["Payment Date", "First Name", "Last Name", "Campaign Title", "Total Amount", "Payment Status"],
      "zeffy",
    );
    expect(map).toMatchObject({ date: 0, donorFirst: 1, donorLast: 2, campaign: 3, amount: 4, status: 5 });
    expect(map.description).toBe(NO_COLUMN);
  });
});

describe("extractRows", () => {
  it("reads a bank statement with signed amounts", () => {
    const table = parseCsv("Date,Description,Amount\n01/05/2026,AMAZON MKTPL,-45.10\n01/06/2026,ZEFFY PAYOUT,750\n01/07/2026,junk,abc\n");
    const { rows, errors } = extractRows(table, detectColumns(table[0], "bank"), { mode: "bank" });
    expect(rows).toEqual([
      expect.objectContaining({ date: "2026-01-05", amount: 45.1, type: "expense" }),
      expect.objectContaining({ date: "2026-01-06", amount: 750, type: "income" }),
    ]);
    expect(errors).toEqual([{ line: 4, message: "No readable amount" }]);
  });

  it("flips signs for credit card exports", () => {
    const table = parseCsv("Date,Description,Amount\n01/05/2026,ADOBE,20\n01/06/2026,PAYMENT THANK YOU,-20\n");
    const { rows } = extractRows(table, detectColumns(table[0], "bank"), { mode: "bank", flipSigns: true });
    expect(rows.map((r) => r.type)).toEqual(["expense", "income"]);
  });

  it("combines debit and credit columns", () => {
    const table = parseCsv("Date,Payee,Debit,Credit\n2026-02-01,RENT,500.00,\n2026-02-02,DEPOSIT,,100\n");
    const { rows } = extractRows(table, detectColumns(table[0], "bank"), { mode: "bank" });
    expect(rows.map((r) => [r.type, r.amount])).toEqual([["expense", 500], ["income", 100]]);
  });

  it("tags Zeffy donors and campaigns and skips failed payments", () => {
    const table = parseCsv(
      "Payment Date,First Name,Last Name,Campaign Title,Total Amount,Payment Status\n" +
        "2026-03-01,Pat,Doe,Monthly Givers,25.00,Succeeded\n" +
        "2026-03-02,Sam,Roe,Gala,100,Failed\n" +
        "2026-03-03,Pat,Doe,Monthly Givers,-25.00,Refunded\n" +
        "2026-03-04,Lee,Poe,Gala,50.00,Refunded\n",
    );
    const { rows, skipped } = extractRows(table, detectColumns(table[0], "zeffy"), { mode: "zeffy" });
    expect(rows).toEqual([
      expect.objectContaining({ donorName: "Pat Doe", campaign: "Monthly Givers", amount: 25, type: "income" }),
      expect.objectContaining({ amount: -25, type: "income" }),
    ]);
    // The failed payment, and the gift marked refunded in place.
    expect(skipped.map((s) => s.line)).toEqual([3, 5]);
  });
});

describe("vendor matching", () => {
  const index = buildVendorIndex([
    { vendor: "Amazon Web Services", categoryId: "sw", type: "expense" },
    { vendor: "Amazon", categoryId: "office", type: "expense" },
    { vendor: "Joe's Coffee", description: "SQ *JOES COFFEE 0423 CHATTANOOGA TN", categoryId: "meals", type: "expense" },
  ]);

  it("strips bank noise", () => {
    expect(normalizeVendorText("POS PURCHASE AMAZON.COM*AB12CD SEATTLE WA")).toBe("AMAZON SEATTLE");
  });

  it("prefers the longest vendor name that appears in the description", () => {
    expect(matchVendor("AMAZON WEB SERVICES AWS.AMAZON.CO WA", "expense", index)?.categoryId).toBe("sw");
    expect(matchVendor("AMAZON MKTPL*2K4", "expense", index)?.categoryId).toBe("office");
  });

  it("matches a previously seen raw description despite changing numbers", () => {
    expect(matchVendor("SQ *JOES COFFEE 0917 CHATTANOOGA TN", "expense", index)?.vendor).toBe("Joe's Coffee");
  });

  it("doesn't match across directions or on partial words", () => {
    expect(matchVendor("AMAZON REFUND", "income", index)).toBeNull();
    expect(matchVendor("AMAZONIA TOURS", "expense", index)).toBeNull();
  });

  it("suggests a readable vendor name", () => {
    expect(suggestVendorName("SQ *JOES COFFEE 0423 CHATTANOOGA TN")).toBe("Sq Joes Coffee Chattanooga");
  });
});

describe("isZeffyPayout / importIdentity", () => {
  it("flags Zeffy deposits only", () => {
    expect(isZeffyPayout({ description: "ZEFFY PAYOUT 123", type: "income" })).toBe(true);
    expect(isZeffyPayout({ description: "ZEFFY FEE", type: "expense" })).toBe(false);
  });

  it("is stable across reference-number noise and prefers explicit IDs", () => {
    const a = { date: "2026-01-05", amount: 45.1, type: "expense" as const, description: "AMAZON 1234" };
    expect(importIdentity("bank", a)).toBe(importIdentity("bank", { ...a, description: "AMAZON 9999" }));
    expect(importIdentity("zeffy", { ...a, reference: "pay_1" })).toBe("zeffy|ref|pay_1");
  });
});
