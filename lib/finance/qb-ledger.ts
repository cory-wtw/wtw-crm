import { parseCsv, parseDate, parseMoney } from "./csv";

/**
 * Reads a QuickBooks "General Ledger" report exported to CSV. QuickBooks
 * Online and Desktop lay it out slightly differently, but both are:
 *
 *   a few title lines (company, "General Ledger", date range)
 *   a header row (…Date…, Transaction Type, Num, Name, Memo, Split, Amount | Debit+Credit…)
 *   per account: a section row naming the account, its transactions,
 *   then a "Total for <account>" row.
 *
 * Every transaction appears twice in a GL — once under the bank account and
 * once under the income/expense account. The migration only imports rows
 * under accounts mapped to a category, so mapping the bank account to
 * "skip" is what prevents double counting.
 */

export type LedgerEntry = {
  account: string;
  date: string;
  txnType: string;
  num: string;
  name: string;
  memo: string;
  /** Amount column, or debit − credit. Sign is the account's, not ours. */
  amount: number;
  /** True when amounts came from separate Debit/Credit columns. */
  debitCredit: boolean;
  line: number;
};

export type LedgerParse = {
  entries: LedgerEntry[];
  problems: string[];
};

const find = (headers: string[], re: RegExp) =>
  headers.findIndex((h) => re.test(h.trim()));

export function parseGeneralLedger(text: string): LedgerParse {
  const rows = parseCsv(text);
  const problems: string[] = [];
  const headerAt = rows.findIndex(
    (r) =>
      r.some((c) => /date/i.test(c)) &&
      r.some((c) => /^(amount|debit)$/i.test(c.trim())),
  );
  if (headerAt === -1) {
    return {
      entries: [],
      problems: ["Couldn't find the header row (needs a Date column and an Amount or Debit column)."],
    };
  }
  const h = rows[headerAt];
  const col = {
    account: find(h, /^(distribution\s*)?account$/i),
    date: find(h, /date/i),
    txnType: find(h, /^(transaction\s*)?type$/i),
    num: find(h, /^(num|no\.?|number)$/i),
    name: find(h, /^name$/i),
    memo: find(h, /memo|description/i),
    amount: find(h, /^amount$/i),
    debit: find(h, /^debit$/i),
    credit: find(h, /^credit$/i),
  };
  const cell = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());

  const entries: LedgerEntry[] = [];
  let section = "";
  rows.slice(headerAt + 1).forEach((r, idx) => {
    const line = headerAt + idx + 2;
    const date = parseDate(cell(r, col.date));

    if (!date) {
      // Section headers, totals, "Beginning Balance" lines, report footers.
      // Desktop indents sub-accounts into later columns, so the heading is
      // the first non-empty cell, not necessarily column 0.
      const at = r.findIndex((c) => c.trim() !== "");
      const label = at < 0 ? "" : r[at].trim();
      if (!label || /^total\b/i.test(label)) return;
      if (r.slice(at + 1).every((c) => !c.trim() || parseMoney(c) != null)) {
        section = label.replace(/\s*\(\d+\)$/, "");
      }
      return;
    }

    const account = cell(r, col.account) || section;
    let amount: number | null;
    let debitCredit = false;
    if (col.amount >= 0) {
      amount = parseMoney(cell(r, col.amount));
    } else {
      debitCredit = true;
      const d = parseMoney(cell(r, col.debit)) ?? 0;
      const c = parseMoney(cell(r, col.credit)) ?? 0;
      amount = d - c;
    }
    if (amount == null) {
      problems.push(`Line ${line}: no readable amount`);
      return;
    }
    if (amount === 0) return;
    if (!account) {
      problems.push(`Line ${line}: transaction before any account heading`);
      return;
    }
    entries.push({
      account,
      date,
      txnType: cell(r, col.txnType),
      num: cell(r, col.num),
      name: cell(r, col.name),
      memo: cell(r, col.memo),
      amount,
      debitCredit,
      line,
    });
  });
  return { entries, problems };
}

export type AccountMapping =
  | "skip"
  | { category: string; flip?: boolean };

export type AccountSummary = {
  account: string;
  rows: number;
  /** Raw sum in the ledger's own sign, cents. */
  rawCents: number;
};

export function summarizeAccounts(entries: readonly LedgerEntry[]): AccountSummary[] {
  const map = new Map<string, AccountSummary>();
  for (const e of entries) {
    const s = map.get(e.account) ?? { account: e.account, rows: 0, rawCents: 0 };
    s.rows++;
    s.rawCents += Math.round(e.amount * 100);
    map.set(e.account, s);
  }
  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account));
}

/**
 * Convert a ledger amount to our sign convention (positive = normal for the
 * category's type). Debit/credit exports are unambiguous: expenses are
 * debit-normal, income credit-normal. A single Amount column depends on the
 * QuickBooks edition, so we go by the account's net: a P&L account's net is
 * almost always its normal direction. `flip` in the mapping overrides.
 */
export function signFor(
  categoryType: "income" | "expense",
  summary: AccountSummary,
  debitCredit: boolean,
  flip: boolean | undefined,
): 1 | -1 {
  let sign: 1 | -1;
  if (debitCredit) sign = categoryType === "expense" ? 1 : -1;
  else sign = summary.rawCents < 0 ? -1 : 1;
  return flip ? (-sign as 1 | -1) : sign;
}
