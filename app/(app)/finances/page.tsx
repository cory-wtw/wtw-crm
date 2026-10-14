import Link from "next/link";
import { listCategories, listTransactions } from "@/lib/db/finance";
import {
  FORM_990N_LIMIT,
  buildProfitAndLoss,
  yearRange,
  type CategoryLine,
} from "@/lib/finance/report";
import {
  describeRange,
  rangePresets,
  rangeQuery,
  resolveRange,
  todayIso,
} from "@/lib/finance/range";
import { formatUsdCents } from "@/lib/format";
import { SeedCategoriesButton } from "./seed-categories-button";

export const dynamic = "force-dynamic";

const buttonClasses =
  "inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary";
const primaryClasses =
  "inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white";

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const today = todayIso();
  const range = resolveRange(await searchParams, today);
  const [transactions, categories] = await Promise.all([
    listTransactions(),
    listCategories(),
  ]);

  if (categories.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No categories yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Start with the standard nonprofit list (donations, grants,
            program costs, professional fees, …) and adjust from there.
          </p>
          <div className="mt-4">
            <SeedCategoriesButton />
          </div>
        </div>
      </div>
    );
  }

  const pnl = buildProfitAndLoss(transactions, categories, range);
  const thisYear = Number(today.slice(0, 4));
  const ytdGross = buildProfitAndLoss(transactions, categories, yearRange(thisYear)).grossReceipts;
  const years = [
    ...new Set([thisYear, ...transactions.map((t) => Number(t.date.slice(0, 4)))]),
  ]
    .filter((y) => y > 1900)
    .sort((a, b) => b - a);
  const query = rangeQuery(range);

  return (
    <div className="space-y-8">
      <Header />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {rangePresets(today).map((p) => {
            const q = rangeQuery(p);
            const active = q === query;
            return (
              <Link
                key={p.label}
                href={`/finances?${q}`}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              aria-label="From"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              aria-label="To"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button type="submit" className="h-8 rounded-md border border-border bg-card px-3 text-xs font-bold hover:bg-secondary">
              Apply
            </button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">{describeRange(range)}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Revenue" value={formatUsdCents(pnl.totalIncome)} />
        <Stat label="Expenses" value={formatUsdCents(pnl.totalExpenses)} />
        <Stat
          label={pnl.net >= 0 ? "Surplus" : "Deficit"}
          value={formatUsdCents(pnl.net)}
          tone={pnl.net >= 0 ? "good" : "bad"}
        />
      </section>

      <GrossReceipts year={thisYear} gross={ytdGross} />

      <section className="space-y-3">
        <SectionTitle>Functional allocation</SectionTitle>
        <FunctionalBar f={pnl.functional} total={pnl.totalExpenses} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionTitle>Profit &amp; loss</SectionTitle>
          <div className="flex gap-2">
            <a href={`/api/finances/export?kind=pnl&format=csv&${query}`} className={buttonClasses}>
              P&amp;L CSV
            </a>
            <a href={`/api/finances/export?kind=transactions&format=csv&${query}`} className={buttonClasses}>
              Transactions CSV
            </a>
          </div>
        </div>
        <PnlTable title="Revenue" lines={pnl.income} total={pnl.totalIncome} />
        <PnlTable title="Expenses" lines={pnl.expenses} total={pnl.totalExpenses} split={pnl.functional} />
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-black">
          <span>Net</span>
          <span className={pnl.net < 0 ? "text-destructive" : ""}>{formatUsdCents(pnl.net)}</span>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Year-end package</SectionTitle>
        <p className="text-xs text-muted-foreground">
          For the accountant or the 990-N: a one-page summary PDF (gross
          receipts, P&amp;L, functional split) plus the full transaction list.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {years.map((y) => {
            const q = rangeQuery(yearRange(y));
            return (
              <div key={y} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
                <span className="text-sm font-black">{y}</span>
                <div className="flex gap-2">
                  <a href={`/api/finances/export?kind=pnl&format=pdf&${q}`} className={buttonClasses}>
                    PDF
                  </a>
                  <a href={`/api/finances/export?kind=transactions&format=csv&${q}`} className={buttonClasses}>
                    CSV
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Finances</h1>
        <p className="text-sm text-muted-foreground">
          Money in, money out, and how it splits across program, management
          and fundraising.
        </p>
      </div>
      <Link href="/finances/transactions/new" className={primaryClasses}>
        Add transaction
      </Link>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
      {children}
    </h2>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function GrossReceipts({ year, gross }: { year: number; gross: number }) {
  const pct = Math.min(100, (gross / FORM_990N_LIMIT) * 100);
  const over = gross > FORM_990N_LIMIT;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">
          {year} gross receipts: <span className="tabular-nums">{formatUsdCents(gross)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          990-N limit {formatUsdCents(FORM_990N_LIMIT)}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${over ? "bg-destructive" : pct > 80 ? "bg-[color:var(--wtw-deep-gold)]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {over
          ? "Over $50K. The 990-N may still apply (a first-year organization counts as \u201cnormally\u201d under $50K up to $75K, and the test averages over years), otherwise it\u2019s a 990-EZ. Check with Tim."
          : "The 990-N only asks for this number. Total of all income received this calendar year, before expenses."}
      </p>
    </section>
  );
}

function FunctionalBar({
  f,
  total,
}: {
  f: { program: number; mgmt: number; fundraising: number; programPct: number; mgmtPct: number; fundraisingPct: number };
  total: number;
}) {
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No expenses in this range.</p>;
  }
  const parts = [
    { label: "Program", pct: f.programPct, amount: f.program, cls: "bg-primary" },
    { label: "Management & general", pct: f.mgmtPct, amount: f.mgmt, cls: "bg-[color:var(--wtw-deep-gold)]" },
    { label: "Fundraising", pct: f.fundraisingPct, amount: f.fundraising, cls: "bg-foreground/60" },
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${Math.max(0, p.pct)}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-start gap-2">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${p.cls}`} />
            <div>
              <dt className="text-xs text-muted-foreground">{p.label}</dt>
              <dd className="text-sm font-bold tabular-nums">
                {p.pct.toFixed(1)}% · {formatUsdCents(p.amount)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PnlTable({
  title,
  lines,
  total,
  split,
}: {
  title: string;
  lines: CategoryLine[];
  total: number;
  split?: { program: number; mgmt: number; fundraising: number };
}) {
  const showSplit = !!split;
  const th = "px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]";
  const num = "px-4 py-2 text-right tabular-nums";
  return (
    <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
      <table className={`w-full text-sm ${showSplit ? "min-w-[40rem]" : ""}`}>
        <thead className="bg-secondary/60">
          <tr>
            <th className={`${th} text-left`}>{title}</th>
            {showSplit && (
              <>
                <th className={`${th} hidden text-right sm:table-cell`}>Program</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Mgmt</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Fundraising</th>
              </>
            )}
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr className="border-t border-border">
              <td colSpan={showSplit ? 5 : 2} className="px-4 py-3 text-xs text-muted-foreground">
                Nothing in this range.
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={l.categoryId} className="border-t border-border">
              <td className="px-4 py-2">
                {l.name}
                <span className="ml-2 text-xs text-muted-foreground">{l.count}</span>
              </td>
              {showSplit && (
                <>
                  <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(l.program)}</td>
                  <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(l.mgmt)}</td>
                  <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(l.fundraising)}</td>
                </>
              )}
              <td className={num}>{formatUsdCents(l.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-border bg-secondary/30 font-bold">
            <td className="px-4 py-2">Total {title.toLowerCase()}</td>
            {split && (
              <>
                <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(split.program)}</td>
                <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(split.mgmt)}</td>
                <td className={`${num} hidden sm:table-cell`}>{formatUsdCents(split.fundraising)}</td>
              </>
            )}
            <td className={num}>{formatUsdCents(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
