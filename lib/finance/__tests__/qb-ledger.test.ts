import { describe, expect, it } from "vitest";
import { parseGeneralLedger, signFor, summarizeAccounts } from "../qb-ledger";

const QBO = `Worth Their Weight
General Ledger
"January 1 - December 31, 2026"

,Date,Transaction Type,Num,Name,Memo/Description,Split,Amount,Balance
Checking,,,,,,,,
,01/05/2026,Expense,,Amazon,"Paper, toner",Office Supplies,-45.00,955.00
,01/09/2026,Deposit,,Pat Doe,Gift,Contributions,250.00,"1,205.00"
Total for Checking,,,,,,,$205.00,
Office Supplies,,,,,,,,
,01/05/2026,Expense,,Amazon,"Paper, toner",Checking,45.00,45.00
Total for Office Supplies,,,,,,,$45.00,
Contributions,,,,,,,,
,01/09/2026,Deposit,,Pat Doe,Gift,Checking,250.00,250.00
Total for Contributions,,,,,,,$250.00,
TOTAL,,,,,,,$500.00,

"Accrual Basis Tuesday, October 13, 2026"
`;

describe("parseGeneralLedger", () => {
  const { entries, problems } = parseGeneralLedger(QBO);

  it("assigns each row to its account section", () => {
    expect(problems).toEqual([]);
    expect(entries.map((e) => [e.account, e.amount])).toEqual([
      ["Checking", -45],
      ["Checking", 250],
      ["Office Supplies", 45],
      ["Contributions", 250],
    ]);
    expect(entries[2]).toMatchObject({ date: "2026-01-05", name: "Amazon", memo: "Paper, toner", txnType: "Expense" });
  });

  it("reads Desktop-style debit/credit columns", () => {
    const desktop = `General Ledger
,Type,Date,Num,Name,Memo,Split,Debit,Credit,Balance
Contributions,,,,,,,,,
,Deposit,01/09/2026,,Pat Doe,Gift,Checking,,250.00,-250.00
Total Contributions,,,,,,,,250.00,
`;
    const { entries: rows } = parseGeneralLedger(desktop);
    expect(rows).toEqual([expect.objectContaining({ account: "Contributions", amount: -250, debitCredit: true })]);
    const summary = summarizeAccounts(rows)[0];
    expect(signFor("income", summary, true, false)).toBe(-1); // → +250 income
  });

  it("follows Desktop sub-account headings indented into later columns", () => {
    const desktop = `General Ledger
,,Type,Date,Num,Name,Memo,Split,Debit,Credit,Balance
Expenses,,,,,,,,,,
,Office Supplies,,,,,,,,,
,,Check,01/05/2026,101,Amazon,Toner,Checking,45.00,,45.00
,Total Office Supplies,,,,,,,45.00,,
,Rent,,,,,,,,,
,,Check,02/01/2026,102,Landlord,,Checking,500.00,,500.00
Total Expenses,,,,,,,,545.00,,
`;
    const { entries: rows } = parseGeneralLedger(desktop);
    expect(rows.map((e) => [e.account, e.amount])).toEqual([
      ["Office Supplies", 45],
      ["Rent", 500],
    ]);
  });

  it("infers the sign from the account's net when there's one Amount column", () => {
    const [contrib] = summarizeAccounts(entries).filter((s) => s.account === "Contributions");
    expect(signFor("income", contrib, false, false)).toBe(1);
    expect(signFor("income", contrib, false, true)).toBe(-1);
    expect(signFor("income", { account: "x", rows: 1, rawCents: -100 }, false, false)).toBe(-1);
  });
});
