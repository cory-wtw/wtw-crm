import { describe, expect, it } from "vitest";
import { lifetimeBenefit, veteranInputSchema } from "..";

const base = {
  firstName: "Test",
  preferredContact: "phone" as const,
  phone: "555-0100",
  pipelineStage: "found" as const,
};

describe("veteranInputSchema", () => {
  it("requires firstName", () => {
    const result = veteranInputSchema.safeParse({
      preferredContact: "phone",
      phone: "555-0100",
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "firstName"),
      ).toBe(true);
    }
  });

  it("accepts a minimal record (first name + phone)", () => {
    const result = veteranInputSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("upper-cases the last initial", () => {
    const result = veteranInputSchema.safeParse({ ...base, lastInitial: "d" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lastInitial).toBe("D");
  });

  it("rejects a multi-character last initial", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      lastInitial: "Do",
    });
    expect(result.success).toBe(false);
  });

  it("requires a phone when the preferred contact is phone", () => {
    const result = veteranInputSchema.safeParse({
      firstName: "Test",
      preferredContact: "phone",
      phone: "",
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "phone")).toBe(
        true,
      );
    }
  });

  it("requires an email when the preferred contact is email", () => {
    const result = veteranInputSchema.safeParse({
      firstName: "Test",
      preferredContact: "email",
      email: "",
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an email-preferred record", () => {
    const result = veteranInputSchema.safeParse({
      firstName: "Test",
      preferredContact: "email",
      email: "vet@example.com",
      pipelineStage: "found",
    });
    expect(result.success).toBe(true);
  });

  it("rejects storing both a phone and an email", () => {
    const result = veteranInputSchema.safeParse({
      firstName: "Test",
      preferredContact: "phone",
      phone: "555-0100",
      email: "vet@example.com",
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "email")).toBe(
        true,
      );
    }
  });

  it("rejects an invalid email", () => {
    const result = veteranInputSchema.safeParse({
      firstName: "Test",
      preferredContact: "email",
      email: "not-an-email",
      pipelineStage: "found",
    });
    expect(result.success).toBe(false);
  });

  it("rejects birth years before 1900", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      birthYear: 1850,
    });
    expect(result.success).toBe(false);
  });

  it("rejects future birth years", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      birthYear: new Date().getFullYear() + 5,
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
      const result = veteranInputSchema.safeParse({ ...base, pipelineStage: stage });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown pipeline stages", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
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
