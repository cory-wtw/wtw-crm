import { describe, expect, it } from "vitest";
import { monthlyBenefitLift, veteranInputSchema } from "..";

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

  it("accepts optional city and state", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      city: "Chattanooga",
      state: "TN",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.city).toBe("Chattanooga");
      expect(result.data.state).toBe("TN");
    }
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

  it("accepts before/after monthly benefit amounts", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      monthlyBenefitBefore: 0,
      monthlyBenefitAfter: 1850,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative monthly benefit", () => {
    const result = veteranInputSchema.safeParse({
      ...base,
      monthlyBenefitAfter: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("monthlyBenefitLift", () => {
  it("is after minus before", () => {
    expect(monthlyBenefitLift(0, 1850)).toBe(1850);
    expect(monthlyBenefitLift(500, 2000)).toBe(1500);
  });

  it("never goes negative", () => {
    expect(monthlyBenefitLift(2000, 500)).toBe(0);
  });

  it("treats missing values as 0", () => {
    expect(monthlyBenefitLift(null, 1000)).toBe(1000);
    expect(monthlyBenefitLift(undefined, undefined)).toBe(0);
  });
});

describe("monthlyBenefitLift", () => {
  it("is after minus before", () => {
    expect(monthlyBenefitLift(0, 1850)).toBe(1850);
    expect(monthlyBenefitLift(500, 2000)).toBe(1500);
  });

  it("never goes negative", () => {
    expect(monthlyBenefitLift(2000, 500)).toBe(0);
  });

  it("treats missing values as 0", () => {
    expect(monthlyBenefitLift(null, 1000)).toBe(1000);
    expect(monthlyBenefitLift(undefined, undefined)).toBe(0);
  });
});
