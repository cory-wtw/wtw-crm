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
    // Totals only: every value is a number or a date string, never a record.
    const { recent, ...top } = out;
    for (const x of [...Object.values(top), ...Object.values(recent)]) {
      expect(["number", "string"]).toContain(typeof x);
    }
  });

  it("doesn't divide by zero with nothing spent", () => {
    const out = buildPublicImpact({ veterans: [], transactions: [], categories: [], resourceCount: 0, now: new Date() });
    expect(out.benefitsPerDollar).toBe(0);
  });

  it("counts only the last six months in recent", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const out = buildPublicImpact({
      veterans: [
        v({ dateFound: new Date("2026-01-10T00:00:00Z"), pipelineStage: "won", dateWon: new Date("2026-03-01T00:00:00Z"), monthlyBenefitBefore: 0, monthlyBenefitAfter: 500, birthYear: 1980 }),
        v({ dateFound: new Date("2026-08-10T00:00:00Z"), pipelineStage: "won", dateWon: new Date("2026-10-01T00:00:00Z"), monthlyBenefitBefore: 0, monthlyBenefitAfter: 1000, birthYear: 1980 }),
        v({ dateFound: new Date("2026-09-01T00:00:00Z"), outcomes: [{ kind: "job", achievedAt: new Date("2026-10-15T00:00:00Z") }, { kind: "job", achievedAt: new Date("2026-02-01T00:00:00Z") }] }),
      ],
      transactions: [
        { date: "2026-02-01", amount: 900, type: "expense", categoryId: "x" },
        { date: "2026-09-01", amount: 100, type: "expense", categoryId: "x" },
        { date: "2026-09-02", amount: 2000, type: "income", categoryId: "x" },
      ],
      categories: [],
      resourceCount: 0,
      now,
    });
    expect(out.recent).toMatchObject({
      from: "2026-05-02",
      to: "2026-11-02",
      months: 6,
      veteransFound: 2,
      claimsWon: 1,
      monthlyBenefits: 1000,
      otherWins: 1,
      raised: 2000,
      spent: 100,
    });
    expect(out.veteransFound).toBe(3);
    expect(out.spent).toBe(1000);
  });
});
