import { describe, expect, it } from "vitest";
import { buildPublicImpact } from "../public-impact";
import type { ImpactVeteran } from "../impact";

const v = (o: Partial<ImpactVeteran>): ImpactVeteran => ({
  pipelineStage: "found",
  createdAt: new Date("2026-05-10T12:00:00Z"),
  ...o,
});

describe("buildPublicImpact", () => {
  it("returns totals only, rounded", () => {
    const out = buildPublicImpact({
      veterans: [
        v({}),
        v({ pipelineStage: "won", monthlyBenefitBefore: 0, monthlyBenefitAfter: 1000.4, birthYear: 1990 }),
        v({ pipelineStage: "connected", outcomes: [{ kind: "job" }, { kind: "housedPermanent" }] }),
      ],
      transactions: [
        { date: "2026-06-01", amount: 5000, type: "income", categoryId: "x" },
        { date: "2026-06-02", amount: 100, type: "expense", categoryId: "x" },
      ],
      categories: [],
      resourceCount: 42,
      now: new Date("2026-11-02T00:00:00Z"),
    });
    expect(out).toMatchObject({
      veteransFound: 3,
      veteransConnected: 2,
      claimsWon: 1,
      monthlyBenefits: 1000,
      otherWins: 2,
      veteransHoused: 1,
      resourcesInDirectory: 42,
      raised: 5000,
      spent: 100,
      programPct: 0,
      updatedAt: "2026-11-02T00:00:00.000Z",
    });
    expect(out.benefitsPerDollar).toBe(Math.round(out.lifetimeBenefits / 100));
    expect(Object.values(out).every((x) => typeof x === "number" || typeof x === "string")).toBe(true);
  });

  it("doesn't divide by zero with nothing spent", () => {
    const out = buildPublicImpact({ veterans: [], transactions: [], categories: [], resourceCount: 0, now: new Date() });
    expect(out.benefitsPerDollar).toBe(0);
  });
});
