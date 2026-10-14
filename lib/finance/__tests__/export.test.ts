import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Category, Transaction } from "@/lib/schemas/finance";
import { parseCsv } from "../csv";
import { pnlCsv, transactionsCsv } from "../export";
import { buildProfitAndLoss } from "../report";

vi.mock("server-only", () => ({}));

const categories: Category[] = [
  { id: "don", name: "Donations", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { id: "sw", name: "Software 💻", type: "expense", defaultProgramPct: 60, defaultMgmtPct: 30, defaultFundraisingPct: 10 },
];

const meta = { source: "manual" as const, createdBy: "u", createdAt: new Date(), updatedBy: "u", updatedAt: new Date() };
const transactions: Transaction[] = [
  { ...meta, id: "1", date: "2026-02-01", vendor: "Zeffy", amount: 750, type: "income", categoryId: "don", donorName: "Pat Doe", campaign: "Monthly" },
  { ...meta, id: "2", date: "2026-01-15", vendor: "=cmd", amount: 100, type: "expense", categoryId: "sw", notes: "a, b" },
  { ...meta, id: "3", date: "2025-06-01", vendor: "Old", amount: 5, type: "expense", categoryId: "sw" },
];
const range = { from: "2026-01-01", to: "2026-12-31" };

describe("transactionsCsv", () => {
  const rows = parseCsv(transactionsCsv(transactions, categories, range));

  it("lists in-range rows oldest first with the split spelled out", () => {
    expect(rows).toHaveLength(3);
    expect(rows[1].slice(0, 8)).toEqual(["2026-01-15", "Expense", "Software 💻", "'=cmd", "", "", "", "100.00"]);
    expect(rows[1].slice(8, 15)).toEqual(["60", "30", "10", "60.00", "30.00", "10.00", "Category default"]);
    expect(rows[1][16]).toBe("a, b");
    expect(rows[2].slice(5, 7)).toEqual(["Pat Doe", "Monthly"]);
  });
});

describe("pnlCsv", () => {
  it("includes totals, gross receipts and functional %", () => {
    const csv = pnlCsv(buildProfitAndLoss(transactions, categories, range), "Calendar year 2026");
    const rows = parseCsv(csv);
    expect(rows).toContainEqual(["990-N", "Gross receipts", "", "750.00"]);
    expect(rows).toContainEqual(["Net", "Revenue less expenses", "", "650.00"]);
    expect(rows).toContainEqual(["Functional %", "Share of total expenses", "", "", "60%", "30%", "10%"]);
  });
});

describe("pnlPdf", () => {
  it("renders, including names the standard font can't encode", async () => {
    const { pnlPdf } = await import("../pdf");
    const bytes = await pnlPdf(buildProfitAndLoss(transactions, categories, range), "Calendar year 2026", "2026-10-13");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
