import { listCategories, listTransactions } from "@/lib/db/finance";
import { listResources } from "@/lib/db/resources";
import { listVeterans } from "@/lib/db/veterans";
import { listVsos } from "@/lib/db/vsos";
import {
  FUNNEL_STAGES,
  benefitTotals,
  cashByMonth,
  pipelineFunnel,
  veteransByMonth,
} from "@/lib/finance/impact";
import { todayIso } from "@/lib/finance/range";
import { buildProfitAndLoss } from "@/lib/finance/report";
import { formatUsd, formatUsdCents } from "@/lib/format";
import { LIFE_EXPECTANCY_AGE, ASSUMED_ANNUAL_COLA, PIPELINE_DESCRIPTIONS, PIPELINE_LABELS } from "@/lib/schemas";
import { MonthColumns } from "./impact-charts";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export default async function ImpactPage() {
  const [veterans, transactions, categories, vsos, resources] = await Promise.all([
    listVeterans(),
    listTransactions(),
    listCategories(),
    listVsos(),
    listResources(),
  ]);

  const funnel = pipelineFunnel(veterans);
  const benefits = benefitTotals(veterans);
  const pnl = buildProfitAndLoss(transactions, categories);
  const spent = pnl.totalExpenses;
  const perDollar = spent > 0 ? benefits.lifetime / spent : 0;
  const cents = (pct: number) => Math.round(pct);
  const cash = cashByMonth(transactions);
  const found = veteransByMonth(veterans);
  const activePartners = vsos.filter((v) => v.partnershipStatus === "active_partner").length;
  const since = transactions.length ? transactions[transactions.length - 1].date : todayIso();
  const sinceLabel = new Date(`${since}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const funnelMax = Math.max(1, funnel.found);

  const parts = [
    { label: "Program — serving veterans", value: pnl.functional.program, pct: pnl.functional.programPct, color: "var(--viz-1)" },
    { label: "Management & general", value: pnl.functional.mgmt, pct: pnl.functional.mgmtPct, color: "var(--viz-2)" },
    { label: "Fundraising", value: pnl.functional.fundraising, pct: pnl.functional.fundraisingPct, color: "var(--viz-3)" },
  ];

  const sources = [...pnl.income].filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
  const sourcesMax = Math.max(1, ...sources.map((s) => s.total));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">Worth Their Weight</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Impact report</h1>
          <p className="text-sm text-muted-foreground">What our work has produced for veterans since {sinceLabel}, and what it cost.</p>
        </div>
        <PrintButton />
      </div>

      {/* Hero */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Estimated lifetime VA benefits unlocked</p>
          <p className="mt-2 text-5xl font-black tabular-nums tracking-tight sm:text-6xl">{compactUsd.format(benefits.lifetime)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            From <span className="font-bold text-foreground">{formatUsd(benefits.monthly)}/month</span> in new tax-free benefits
            for {benefits.withBenefits} {benefits.withBenefits === 1 ? "veteran" : "veterans"} so far.*
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">For every $1 WTW has spent</p>
          <p className="mt-2 text-5xl font-black tabular-nums tracking-tight sm:text-6xl">${Math.round(perDollar)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            in estimated lifetime benefits reaches veterans. Total spent: {formatUsd(spent)}.
          </p>
        </div>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Veterans reached", String(funnel.found)],
          ["Connected to a VSO", String(funnel.connected)],
          ["Claims filed", String(funnel.filed)],
          ["Claims won", String(funnel.won)],
          ["VSO partners", activePartners ? `${activePartners} active` : String(vsos.length)],
          ["Community resources", String(resources.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      {/* Funnel */}
      <section className="space-y-3">
        <SectionTitle title="From the street to a won claim" note="Every veteran counts at each stage they've reached." />
        <div className="space-y-2 rounded-xl border border-border bg-card p-5">
          {FUNNEL_STAGES.map((s) => (
            <div key={s} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 sm:grid-cols-[8rem_1fr_3rem]">
              <div>
                <p className="text-sm font-bold">{PIPELINE_LABELS[s]}</p>
                <p className="hidden text-[11px] leading-tight text-muted-foreground sm:block">{PIPELINE_DESCRIPTIONS[s]}</p>
              </div>
              <div className="h-6 rounded-r bg-secondary/60" title={`${PIPELINE_LABELS[s]}: ${funnel[s]}`}>
                <div className="h-full rounded-r" style={{ width: `${(funnel[s] / funnelMax) * 100}%`, background: "var(--viz-1)" }} />
              </div>
              <p className="text-right text-sm font-black tabular-nums">{funnel[s]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Where the money goes */}
      <section className="space-y-3">
        <SectionTitle title="Where every dollar goes" />
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p className="text-lg">
            <span className="text-3xl font-black tabular-nums">{cents(pnl.functional.programPct)}¢</span> of every dollar goes
            directly to finding and serving veterans.
          </p>
          <div className="flex h-4 gap-[2px] overflow-hidden rounded" role="img" aria-label="Functional split of expenses">
            {parts.filter((p) => p.pct > 0).map((p) => (
              <div key={p.label} title={`${p.label}: ${p.pct}% (${formatUsdCents(p.value)})`} style={{ width: `${p.pct}%`, background: p.color }} />
            ))}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {parts.map((p) => (
              <div key={p.label} className="flex items-start gap-2">
                <span className="mt-1 inline-block size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                <div>
                  <dt className="text-xs text-muted-foreground">{p.label}</dt>
                  <dd className="text-sm font-bold tabular-nums">
                    {p.pct.toFixed(1)}% · {formatUsd(p.value)}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Monthly charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <SectionTitle title="Money in and out" note="Cash basis, by month." />
          <div className="rounded-xl border border-border bg-card p-4">
            <MonthColumns
              label="Money in and out by month"
              data={cash}
              series={[
                { key: "income", label: "Money in", color: "var(--viz-1)" },
                { key: "expenses", label: "Money out", color: "var(--viz-2)" },
              ]}
              format="usd"
            />
          </div>
        </div>
        <div className="space-y-3">
          <SectionTitle title="Veterans found each month" />
          <div className="rounded-xl border border-border bg-card p-4">
            <MonthColumns
              label="Veterans found each month"
              data={found}
              series={[{ key: "count", label: "Veterans found", color: "var(--viz-1)" }]}
              format="count"
            />
          </div>
        </div>
      </section>

      {/* Funding sources */}
      {sources.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title="Where our funding comes from" note={`${formatUsd(pnl.totalIncome)} raised in total.`} />
          <div className="space-y-2 rounded-xl border border-border bg-card p-5">
            {sources.map((s) => (
              <div key={s.categoryId} className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3">
                <p className="truncate text-sm">{s.name}</p>
                <div className="h-3 rounded-r bg-secondary/60">
                  <div className="h-full rounded-r" style={{ width: `${(s.total / sourcesMax) * 100}%`, background: "var(--viz-1)" }} />
                </div>
                <p className="text-right text-sm font-bold tabular-nums">{formatUsd(s.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="max-w-3xl text-xs text-muted-foreground">
        * Lifetime benefits are an estimate, not a VA figure: each veteran&apos;s current monthly increase, projected to age{" "}
        {LIFE_EXPECTANCY_AGE} with a {(ASSUMED_ANNUAL_COLA * 100).toFixed(1)}% annual cost-of-living adjustment. &ldquo;Per $1
        spent&rdquo; divides that estimate by all of WTW&apos;s recorded expenses. Claims are filed and won by VA-accredited
        partners; WTW finds veterans and connects them.
      </p>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">{title}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
