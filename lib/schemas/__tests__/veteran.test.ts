import { describe, expect, it } from "vitest";
import {
  BRANCHES,
  DISCHARGE_STATUSES,
  HOUSING_STATUSES,
  lifetimeBenefit,
  veteranInputSchema,
} from "..";

describe("veteranInputSchema", () => {
  it("requires name", () => {
    const result = veteranInputSchema.safeParse({
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "name")).toBe(
        true,
      );
    }
  });

  it("accepts a minimal record (name only)", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test Veteran",
      pipelineStage: "found",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown branches", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      branch: "marines_reserve",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every defined branch", () => {
    for (const branch of BRANCHES) {
      const result = veteranInputSchema.safeParse({
        name: "Test",
        pipelineStage: "found",
        branch,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown discharge statuses", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      dischargeStatus: "honorable_with_distinction",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every defined discharge status", () => {
    for (const status of DISCHARGE_STATUSES) {
      const result = veteranInputSchema.safeParse({
        name: "Test",
        pipelineStage: "found",
        dischargeStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown housing statuses", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      housingStatus: "couch_surfing",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every defined housing status", () => {
    for (const status of HOUSING_STATUSES) {
      const result = veteranInputSchema.safeParse({
        name: "Test",
        pipelineStage: "found",
        housingStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects birth years before 1900", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      birthYear: 1850,
    });
    expect(result.success).toBe(false);
  });

  it("rejects future birth years", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      birthYear: new Date().getFullYear() + 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative income", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      yearlyIncome: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative household size", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "found",
      householdSize: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts every defined pipeline stage", () => {
    for (const stage of [
      "found",
      "connected",
      "filed",
      "won",
      "lost",
    ] as const) {
      const result = veteranInputSchema.safeParse({
        name: "Test",
        pipelineStage: stage,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown pipeline stages", () => {
    const result = veteranInputSchema.safeParse({
      name: "Test",
      pipelineStage: "in_review",
    });
    expect(result.success).toBe(false);
  });
});

describe("lifetimeBenefit", () => {
  it("matches Cory's row: 50 years × 12 × $4,928.81 = $2,957,286", () => {
    expect(lifetimeBenefit(4928.81, 50)).toBeCloseTo(2957286, 0);
  });

  it("multiplies monthly amount by 12 by life expectancy at found", () => {
    expect(lifetimeBenefit(1000, 30)).toBe(360_000);
  });

  it("returns 0 when monthly amount is missing", () => {
    expect(lifetimeBenefit(null, 30)).toBe(0);
    expect(lifetimeBenefit(undefined, 30)).toBe(0);
    expect(lifetimeBenefit(0, 30)).toBe(0);
  });

  it("returns 0 when life expectancy is missing", () => {
    expect(lifetimeBenefit(1000, null)).toBe(0);
    expect(lifetimeBenefit(1000, undefined)).toBe(0);
    expect(lifetimeBenefit(1000, 0)).toBe(0);
  });
});
