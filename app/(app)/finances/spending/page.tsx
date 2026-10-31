import Link from "next/link";
import { listCategories, listTransactions, listVendorAliases, listVendorMonthly } from "@/lib/db/finance";
import { describeRange, rangePresets, rangeQuery, resolveRange, todayIso } from "@/lib/finance/range";
import { inRange } from "@/lib/finance/report";
import { findRecurring, spendByMonth, summarizeVendors, vendorName } from "@/lib/finance/spending";
import { spendByVeteran } from "@/lib/finance/per-veteran";
import { listVeterans } from "@/lib/db/veterans";
import { formatShortName } from "@/lib/name";
import { formatMonth, formatUsdCents } from "@/lib/format";
import { RecurringList } from "./recurring-list";
import { SpendingVendors, type VendorTx } from "./spending-vendors";

export const dynamic = "force-dynamic";

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const today = todayIso();
  const range = resolveRange(await searchParams, today);
  const [transactions, categories, aliases, overrides, veterans] = await Promise.all([
    listTransactions(),
    listCategories(),
    listVendorAliases(),
    listVendorMonthly(),
    listVeterans(),
  ]);
  const veteranName = Object.fromEntries(veterans.map((v) => [v.id, formatShortName(v.firstName, v.lastInitial)]));
  const perVeteran = spendByVeteran(transactions.filter((t) => inRange(t.date, range)));
  const perVeteranTotal = perVeteran.reduce((s, r) => s + Math.round(r.total * 100), 0) / 100;
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const rows = transactions.map((t) => ({
    id: t.id,
    date: t.date,
    vendor: t.vendor,
    description: t.description,
    amount: t.amount,
    type: t.type,
    categoryId: t.categoryId,
  }));

  const recurring = findRecurring(rows, aliases, today, overrides);
  const active = recurring.filter((r) => r.active);
  const stopped = recurring.filter((r) => !r.active);
  const monthlyTotal = active.reduce((s, r) => s + Math.round(r.monthly * 100), 0) / 100;
  const vendors = summarizeVendors(rows, aliases, range);
  const months = spendByMonth(rows, range);
  const query = rangeQuery(range);

  const vendorTxs: VendorTx[] = transactions
    .filter((t) => t.type === "expense" && inRange(t.date, range))
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      label: t.vendor || t.description || "—",
      detail: t.vendor && t.description && t.description !== t.vendor ? t.description : "",
      category: catName[t.categoryId] ?? "Uncategorized",
      vendor: vendorName(t, aliases),
    }));

  // Month view: the categories that matter most across the range get their
  // own column; the long tail folds into "Other".
  const catTotals = new Map<string, number>();
  for (const m of months)
    for (const [id, v] of Object.entries(m.byCategory)) catTotals.set(id, (catTotals.get(id) ?? 0) + v);
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  const th = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--wtw-deep-gold)]";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Spending</h1>
        <p className="text-sm text-muted-foreground">What WTW pays for: ongoing costs, every vendor, and month by month.</p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">Ongoing costs</h2>
          <p className="text-sm">
            <span className="font-black tabular-nums">{formatUsdCents(monthlyTotal)}</span>
            <span className="text-muted-foreground"> / month across {active.length} active</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Each bill&apos;s monthly cost is what it charged in its latest billing cycle, unless you set an amount. A bill counts as stopped once it&apos;s gone quiet for half again its usual gap (about 45 days for a monthly bill).
        </p>
        <RecurringList rows={active.map((r) => ({ ...r, category: catName[r.mainCategoryId] ?? "Uncategorized" }))} empty="No active recurring charges." />
        {stopped.length > 0 && (
          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
              Stopped ({stopped.length}) <span className="font-normal text-muted-foreground">— gone quiet for longer than usual</span>
            </summary>
            <div className="border-t border-border">
              <RecurringList rows={stopped.map((r) => ({ ...r, category: catName[r.mainCategoryId] ?? "Uncategorized" }))} empty="" bare />
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {rangePresets(today).map((p) => {
            const q = rangeQuery(p);
            return (
              <Link
                key={p.label}
                href={`/finances/spending?${q}`}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  q === query ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
          <span className="text-xs text-muted-foreground">{describeRange(range)}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">By month</h2>
        {months.length === 0 ? (
          <p className="text-xs text-muted-foreground">No spending in this range.</p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className={`${th} text-left`}>Month</th>
                  {topCats.map((id) => (
                    <th key={id} className={`${th} text-right`}>{catName[id] ?? "Uncategorized"}</th>
                  ))}
                  <th className={`${th} text-right`}>Other</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const other = Object.entries(m.byCategory)
                    .filter(([id]) => !topCats.includes(id))
                    .reduce((s, [, v]) => s + v, 0);
                  return (
                    <tr key={m.month} className="border-t border-border">
                      <td className="px-3 py-2 font-bold">
                        {formatMonth(m.month)}
                      </td>
                      {topCats.map((id) => (
                        <td key={id} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {m.byCategory[id] ? formatUsdCents(m.byCategory[id]) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{other ? formatUsdCents(other) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary sm:block">
                            <div className="h-full bg-primary" style={{ width: `${Math.max(0, (m.total / maxMonth) * 100)}%` }} />
                          </div>
                          <span className="font-bold tabular-nums">{formatUsdCents(m.total)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">By veteran</h2>
          {perVeteran.length > 0 && (
            <p className="text-sm">
              <span className="font-black tabular-nums">{formatUsdCents(perVeteranTotal)}</span>
              <span className="text-muted-foreground"> on {perVeteran.length} {perVeteran.length === 1 ? "veteran" : "veterans"}</span>
            </p>
          )}
        </div>
        {perVeteran.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No expenses linked to a veteran in this range. Pick the veteran on an expense — their bus pass, an ID fee — to see it here.
          </p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className={`${th} text-left`}>Veteran</th>
                  <th className={`${th} text-right`}>Expenses</th>
                  <th className={`${th} text-right`}>Latest</th>
                  <th className={`${th} text-right`}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {perVeteran.map((r) => (
                  <tr key={r.veteranId} className="border-t border-border">
                    <td className="px-3 py-2 font-bold">
                      <Link href={`/veterans/${r.veteranId}`} className="underline-offset-4 hover:underline">
                        {veteranName[r.veteranId] || "(removed veteran)"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.lastDate}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{formatUsdCents(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">By vendor</h2>
        <SpendingVendors
          vendors={vendors.map((v) => ({
            name: v.name,
            keys: v.keys,
            total: v.total,
            count: v.count,
            first: v.first,
            last: v.last,
            category: catName[v.mainCategoryId] ?? "Uncategorized",
          }))}
          transactions={vendorTxs}
        />
      </section>
    </div>
  );
}
