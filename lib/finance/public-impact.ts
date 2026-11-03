import type { Category } from "@/lib/schemas";
import { benefitTotals, outcomeTotals, pipelineFunnel, type ImpactVeteran } from "./impact";
import { buildProfitAndLoss, type ReportTransaction } from "./report";

/**
 * The totals the public website shows. Counts and dollar sums only: no names,
 * no records, nothing that points to one veteran. Same math as the Impact
 * report, so the site and the Roster never disagree. `recent` repeats the
 * key numbers for the last six months, which better shows the work today.
 */
export type PublicImpact = {
  veteransFound: number;
  veteransConnected: number;
  claimsWon: number;
  /** New tax-free VA benefits per month, summed across veterans. */
  monthlyBenefits: number;
  /** Estimated lifetime value of those benefits. */
  lifetimeBenefits: number;
  /** Wins beyond VA benefits (jobs, housing, SNAP…). */
  otherWins: number;
  veteransHoused: number;
  resourcesInDirectory: number;
  raised: number;
  spent: number;
  /** Share of spending that went to program work, 0–100. */
  programPct: number;
  /** Estimated lifetime benefits per $1 spent. */
  benefitsPerDollar: number;
  /** The same numbers for the last RECENT_MONTHS months only. */
  recent: RecentImpact;
  updatedAt: string;
};

/** How far back the "recent" numbers look. Six months smooths out one-off
 *  bills (a legal fee, a big event) that make a single quarter jump around. */
export const RECENT_MONTHS = 6;

export type RecentImpact = {
  /** First and last day of the window, YYYY-MM-DD. */
  from: string;
  to: string;
  months: number;
  veteransFound: number;
  veteransConnected: number;
  claimsWon: number;
  /** Benefits from claims won in the window. */
  monthlyBenefits: number;
  lifetimeBenefits: number;
  otherWins: number;
  raised: number;
  spent: number;
  programPct: number;
  benefitsPerDollar: number;
};

export function buildPublicImpact(input: {
  veterans: readonly ImpactVeteran[];
  transactions: readonly ReportTransaction[];
  categories: readonly Category[];
  resourceCount: number;
  now: Date;
}): PublicImpact {
  const funnel = pipelineFunnel(input.veterans);
  const benefits = benefitTotals(input.veterans);
  const wins = outcomeTotals(input.veterans);
  const pnl = buildProfitAndLoss(input.transactions, input.categories);
  const spent = Math.round(pnl.totalExpenses);
  return {
    veteransFound: funnel.found,
    veteransConnected: funnel.connected,
    claimsWon: funnel.won,
    monthlyBenefits: Math.round(benefits.monthly),
    lifetimeBenefits: Math.round(benefits.lifetime),
    otherWins: wins.total,
    veteransHoused: wins.housed,
    resourcesInDirectory: input.resourceCount,
    raised: Math.round(pnl.grossReceipts),
    spent,
    programPct: Math.round(pnl.functional.programPct),
    benefitsPerDollar: spent > 0 ? Math.round(benefits.lifetime / spent) : 0,
    recent: buildRecent(input),
    updatedAt: input.now.toISOString(),
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function buildRecent(input: {
  veterans: readonly ImpactVeteran[];
  transactions: readonly ReportTransaction[];
  categories: readonly Category[];
  now: Date;
}): RecentImpact {
  const start = new Date(input.now);
  start.setUTCMonth(start.getUTCMonth() - RECENT_MONTHS);
  const from = isoDay(start);
  const to = isoDay(input.now);
  const within = (d?: Date | null) => !!d && d >= start && d <= input.now;

  const won = input.veterans.filter((v) => within(v.dateWon));
  const benefits = benefitTotals(won);
  const wins = outcomeTotals(
    input.veterans.map((v) => ({ ...v, outcomes: (v.outcomes ?? []).filter((o) => within(o.achievedAt)) })),
  );
  const pnl = buildProfitAndLoss(input.transactions, input.categories, { from, to });
  const spent = Math.round(pnl.totalExpenses);
  return {
    from,
    to,
    months: RECENT_MONTHS,
    veteransFound: input.veterans.filter((v) => within(v.dateFound ?? v.createdAt)).length,
    veteransConnected: input.veterans.filter((v) => within(v.dateConnected)).length,
    claimsWon: won.length,
    monthlyBenefits: Math.round(benefits.monthly),
    lifetimeBenefits: Math.round(benefits.lifetime),
    otherWins: wins.total,
    raised: Math.round(pnl.grossReceipts),
    spent,
    programPct: Math.round(pnl.functional.programPct),
    benefitsPerDollar: spent > 0 ? Math.round(benefits.lifetime / spent) : 0,
  };
}
