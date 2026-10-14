import {
  lifetimeBenefitsUnlocked,
  monthlyBenefitLift,
  type PipelineStage,
} from "@/lib/schemas";

/**
 * Numbers for the Impact report: what WTW's work has produced for veterans,
 * set against what it cost. Pure so the page and its tests share it. Every
 * dollar figure for veterans is the same estimate the Veterans page shows.
 */

export type ImpactVeteran = {
  pipelineStage: PipelineStage;
  monthlyBenefitBefore?: number | null;
  monthlyBenefitAfter?: number | null;
  birthYear?: number | null;
  dateFound?: Date | null;
  dateConnected?: Date | null;
  dateFiled?: Date | null;
  dateWon?: Date | null;
  createdAt: Date;
};

export const FUNNEL_STAGES = ["found", "connected", "filed", "won"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * How many veterans ever reached each stage — not where they sit today. A
 * veteran whose claim was won counts as found, connected and filed too, and
 * one marked lost still counts for the stages they reached before that.
 */
export function pipelineFunnel(veterans: readonly ImpactVeteran[]): Record<FunnelStage, number> {
  const rank: Record<PipelineStage, number> = { found: 0, connected: 1, filed: 2, won: 3, lost: -1 };
  const out: Record<FunnelStage, number> = { found: 0, connected: 0, filed: 0, won: 0 };
  for (const v of veterans) {
    let reached = rank[v.pipelineStage];
    if (v.dateConnected) reached = Math.max(reached, 1);
    if (v.dateFiled) reached = Math.max(reached, 2);
    if (v.dateWon) reached = Math.max(reached, 3);
    reached = Math.max(reached, 0); // everyone on the roster was found
    FUNNEL_STAGES.forEach((s, i) => {
      if (reached >= i) out[s] += 1;
    });
  }
  return out;
}

export function benefitTotals(veterans: readonly ImpactVeteran[]) {
  let monthly = 0;
  let lifetime = 0;
  let withBenefits = 0;
  for (const v of veterans) {
    const lift = monthlyBenefitLift(v.monthlyBenefitBefore, v.monthlyBenefitAfter);
    if (lift > 0) withBenefits += 1;
    monthly += lift;
    lifetime += lifetimeBenefitsUnlocked(v.monthlyBenefitBefore, v.monthlyBenefitAfter, v.birthYear) ?? 0;
  }
  return { monthly, lifetime, withBenefits };
}

/** Veterans found per calendar month (date found, else date added), oldest first. */
export function veteransByMonth(veterans: readonly ImpactVeteran[]): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of veterans) {
    const d = v.dateFound ?? v.createdAt;
    const m = d.toISOString().slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return fillMonths([...counts.keys()]).map((month) => ({ month, count: counts.get(month) ?? 0 }));
}

export type CashMonth = { month: string; income: number; expenses: number };

/** Money in and out per month, gaps filled so quiet months show as zero. */
export function cashByMonth(
  transactions: readonly { date: string; amount: number; type: "income" | "expense" }[],
): CashMonth[] {
  const by = new Map<string, { income: number; expenses: number }>();
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    const row = by.get(m) ?? { income: 0, expenses: 0 };
    const c = Math.round(t.amount * 100);
    if (t.type === "income") row.income += c;
    else row.expenses += c;
    by.set(m, row);
  }
  return fillMonths([...by.keys()]).map((month) => {
    const row = by.get(month) ?? { income: 0, expenses: 0 };
    return { month, income: row.income / 100, expenses: row.expenses / 100 };
  });
}

function fillMonths(months: string[]): string[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const out: string[] = [];
  let [y, m] = sorted[0].split("-").map(Number);
  const [ey, em] = sorted[sorted.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
