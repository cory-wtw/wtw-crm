import type { Category } from "@/lib/schemas";
import { benefitTotals, outcomeTotals, pipelineFunnel, type ImpactVeteran } from "./impact";
import { buildProfitAndLoss, type ReportTransaction } from "./report";

/**
 * The totals the public website shows. Counts and dollar sums only: no names,
 * no records, nothing that points to one veteran. Same math as the Impact
 * report, so the site and the Roster never disagree.
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
  updatedAt: string;
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
    updatedAt: input.now.toISOString(),
  };
}
