import { describe, expect, it } from "vitest";
import { DEPENDENT_STATUSES, rateSchema } from "..";

describe("rateSchema", () => {
  it("accepts a fully populated rate", () => {
    const result = rateSchema.safeParse({
      rateCode: "100-SMCS-SK",
      rating: "100%",
      dependentStatus: "with_spouse_kids",
      monthlyAmount: 4928.81,
      rateYear: 2026,
    });
    expect(result.success).toBe(true);
  });

  it("accepts every defined dependent status", () => {
    for (const status of DEPENDENT_STATUSES) {
      const result = rateSchema.safeParse({
        rateCode: "10-A",
        rating: "10%",
        dependentStatus: status,
        monthlyAmount: 175.51,
        rateYear: 2026,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown dependent statuses", () => {
    const result = rateSchema.safeParse({
      rateCode: "10-A",
      rating: "10%",
      dependentStatus: "single",
      monthlyAmount: 175.51,
      rateYear: 2026,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative monthly amount", () => {
    const result = rateSchema.safeParse({
      rateCode: "10-A",
      rating: "10%",
      dependentStatus: "alone",
      monthlyAmount: -100,
      rateYear: 2026,
    });
    expect(result.success).toBe(false);
  });
});
