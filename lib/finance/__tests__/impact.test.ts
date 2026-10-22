import { describe, expect, it } from "vitest";
import { benefitTotals, cashByMonth, outcomeTotals, pipelineFunnel, veteransByMonth, type ImpactVeteran } from "../impact";

const v = (o: Partial<ImpactVeteran>): ImpactVeteran => ({
  pipelineStage: "found",
  createdAt: new Date("2026-05-10T12:00:00Z"),
  ...o,
});

describe("pipelineFunnel", () => {
  it("counts every stage a veteran ever reached", () => {
    const f = pipelineFunnel([
      v({}),
      v({ pipelineStage: "connected" }),
      v({ pipelineStage: "filed" }),
      v({ pipelineStage: "won" }),
      // Lost after the claim was filed: still counts as connected and filed.
      v({ pipelineStage: "lost", dateConnected: new Date(), dateFiled: new Date() }),
      // Lost straight from found.
      v({ pipelineStage: "lost" }),
    ]);
    expect(f).toEqual({ found: 6, connected: 4, filed: 3, won: 1 });
  });
});

describe("benefitTotals", () => {
  it("sums lift and the lifetime estimate", () => {
    const t = benefitTotals([
      v({ monthlyBenefitBefore: 0, monthlyBenefitAfter: 1000, birthYear: 1990 }),
      v({ monthlyBenefitBefore: 500, monthlyBenefitAfter: 400 }), // never negative
      v({}),
    ]);
    expect(t.monthly).toBe(1000);
    expect(t.withBenefits).toBe(1);
    expect(t.lifetime).toBeGreaterThan(1000 * 12 * 30);
  });
});

describe("by month", () => {
  it("fills gaps with zero months", () => {
    expect(
      veteransByMonth([
        v({ dateFound: new Date("2026-04-02T12:00:00Z") }),
        v({ createdAt: new Date("2026-06-20T12:00:00Z") }),
        v({ dateFound: new Date("2026-06-01T12:00:00Z") }),
      ]),
    ).toEqual([
      { month: "2026-04", count: 1 },
      { month: "2026-05", count: 0 },
      { month: "2026-06", count: 2 },
    ]);
  });

  it("splits money in and out", () => {
    expect(
      cashByMonth([
        { date: "2026-08-03", amount: 100.1, type: "income" },
        { date: "2026-08-20", amount: 0.2, type: "income" },
        { date: "2026-10-01", amount: 50, type: "expense" },
      ]),
    ).toEqual([
      { month: "2026-08", income: 100.3, expenses: 0 },
      { month: "2026-09", income: 0, expenses: 0 },
      { month: "2026-10", income: 0, expenses: 50 },
    ]);
  });
});

describe("outcomeTotals", () => {
  it("counts wins by kind and sums only entered amounts", () => {
    const t = outcomeTotals([
      v({
        outcomes: [
          { kind: "job", monthlyValue: 2400 },
          { kind: "housedPermanent" },
          { kind: "financialAssistance", oneTimeValue: 800 },
        ],
      }),
      v({ outcomes: [{ kind: "snap", monthlyValue: 290 }, { kind: "job" }] }),
      // Shelter then an apartment: one person housed.
      v({ outcomes: [{ kind: "housedTemporary" }, { kind: "housedPermanent" }] }),
      // A retired kind is skipped, not counted as NaN.
      v({ outcomes: [{ kind: "retiredKind" as never }] }),
      v({}),
    ]);
    expect(t.total).toBe(7);
    expect(t.veterans).toBe(3);
    expect(t.jobs).toBe(2);
    expect(t.housed).toBe(2);
    expect(Object.values(t.byKind).every(Number.isFinite)).toBe(true);
    expect(t.monthly).toBe(2690);
    expect(t.annual).toBe(2690 * 12);
    expect(t.oneTime).toBe(800);
  });
});
