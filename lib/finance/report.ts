import type {
  Allocation,
  Category,
  TransactionType,
} from "@/lib/schemas/finance";

/**
 * P&L and functional-allocation math. Pure so it's shared by the overview
 * page and the CSV/PDF exports and can't drift between them. Everything is
 * summed in integer cents to avoid 0.1 + 0.2 drift over a year of rows.
 */

export type ReportTransaction = {
  date: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  allocation?: Allocation;
};

export type DateRange = { from?: string; to?: string };

export function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export const UNCATEGORIZED = "Uncategorized";

export type CategoryLine = {
  categoryId: string;
  name: string;
  total: number;
  program: number;
  mgmt: number;
  fundraising: number;
  count: number;
};

export type ProfitAndLoss = {
  income: CategoryLine[];
  expenses: CategoryLine[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
  functional: {
    program: number;
    mgmt: number;
    fundraising: number;
    programPct: number;
    mgmtPct: number;
    fundraisingPct: number;
  };
  /**
   * Income net of refunds — the 990-N "gross receipts" figure. Same as
   * totalIncome except it never goes below zero.
   */
  grossReceipts: number;
};

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

export function effectiveAllocation(
  tx: Pick<ReportTransaction, "allocation">,
  category: Category | undefined,
): Allocation {
  if (tx.allocation) return tx.allocation;
  if (category) {
    return {
      programPct: category.defaultProgramPct,
      mgmtPct: category.defaultMgmtPct,
      fundraisingPct: category.defaultFundraisingPct,
    };
  }
  // No category on file: treat as overhead rather than inflate program %.
  return { programPct: 0, mgmtPct: 100, fundraisingPct: 0 };
}

/**
 * Split cents across three buckets so the parts always sum to the whole —
 * rounding each independently would leave a stray penny on most rows.
 */
export function splitCents(
  cents: number,
  a: Allocation,
): [program: number, mgmt: number, fundraising: number] {
  const program = Math.round((cents * a.programPct) / 100);
  const fundraising = Math.round((cents * a.fundraisingPct) / 100);
  return [program, cents - program - fundraising, fundraising];
}

export function buildProfitAndLoss(
  transactions: readonly ReportTransaction[],
  categories: readonly Category[],
  range: DateRange = {},
): ProfitAndLoss {
  const byId = new Map(categories.map((c) => [c.id, c]));
  type Acc = {
    total: number;
    program: number;
    mgmt: number;
    fundraising: number;
    count: number;
  };
  const income = new Map<string, Acc>();
  const expenses = new Map<string, Acc>();

  for (const tx of transactions) {
    if (!inRange(tx.date, range)) continue;
    const cents = toCents(tx.amount);
    const bucket = tx.type === "income" ? income : expenses;
    const acc = bucket.get(tx.categoryId) ?? {
      total: 0,
      program: 0,
      mgmt: 0,
      fundraising: 0,
      count: 0,
    };
    acc.total += cents;
    acc.count += 1;
    if (tx.type === "expense") {
      const [p, m, f] = splitCents(
        cents,
        effectiveAllocation(tx, byId.get(tx.categoryId)),
      );
      acc.program += p;
      acc.mgmt += m;
      acc.fundraising += f;
    }
    bucket.set(tx.categoryId, acc);
  }

  const lines = (m: Map<string, Acc>): CategoryLine[] =>
    [...m.entries()]
      .map(([categoryId, a]) => ({
        categoryId,
        name: byId.get(categoryId)?.name ?? UNCATEGORIZED,
        total: fromCents(a.total),
        program: fromCents(a.program),
        mgmt: fromCents(a.mgmt),
        fundraising: fromCents(a.fundraising),
        count: a.count,
      }))
      .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));

  const incomeLines = lines(income);
  const expenseLines = lines(expenses);
  const sum = (ls: CategoryLine[], k: "total" | "program" | "mgmt" | "fundraising") =>
    fromCents(ls.reduce((s, l) => s + toCents(l[k]), 0));

  const totalIncome = sum(incomeLines, "total");
  const totalExpenses = sum(expenseLines, "total");
  const program = sum(expenseLines, "program");
  const mgmt = sum(expenseLines, "mgmt");
  const fundraising = sum(expenseLines, "fundraising");
  const pctOf = (part: number) =>
    totalExpenses === 0 ? 0 : Math.round((part / totalExpenses) * 1000) / 10;

  return {
    income: incomeLines,
    expenses: expenseLines,
    totalIncome,
    totalExpenses,
    net: fromCents(toCents(totalIncome) - toCents(totalExpenses)),
    functional: {
      program,
      mgmt,
      fundraising,
      programPct: pctOf(program),
      mgmtPct: pctOf(mgmt),
      fundraisingPct: pctOf(fundraising),
    },
    grossReceipts: Math.max(0, totalIncome),
  };
}

/** The 990-N e-postcard is only available while gross receipts are normally ≤ $50K. */
export const FORM_990N_LIMIT = 50_000;

export function yearRange(year: number): Required<DateRange> {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
