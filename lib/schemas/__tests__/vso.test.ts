import { describe, expect, it } from "vitest";
import { PARTNERSHIP_STATUSES, vsoInputSchema } from "..";

describe("vsoInputSchema", () => {
  it("requires fullName", () => {
    const result = vsoInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a minimal VSO", () => {
    const result = vsoInputSchema.safeParse({ fullName: "James Patterson" });
    expect(result.success).toBe(true);
  });

  it("accepts every partnership status", () => {
    for (const status of PARTNERSHIP_STATUSES) {
      const result = vsoInputSchema.safeParse({
        fullName: "Test",
        partnershipStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown partnership statuses", () => {
    const result = vsoInputSchema.safeParse({
      fullName: "Test",
      partnershipStatus: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a blank email", () => {
    const result = vsoInputSchema.safeParse({
      fullName: "Test",
      directEmail: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = vsoInputSchema.safeParse({
      fullName: "Test",
      directEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
