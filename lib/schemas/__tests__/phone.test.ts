import { describe, expect, it } from "vitest";
import { PHONE_STATUSES, phoneInputSchema } from "..";

describe("phoneInputSchema", () => {
  it("requires name", () => {
    const result = phoneInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a minimal phone", () => {
    const result = phoneInputSchema.safeParse({ name: "Phone 1" });
    expect(result.success).toBe(true);
  });

  it("accepts every status", () => {
    for (const status of PHONE_STATUSES) {
      const result = phoneInputSchema.safeParse({
        name: "Phone 1",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown statuses", () => {
    const result = phoneInputSchema.safeParse({
      name: "Phone 1",
      status: "broken",
    });
    expect(result.success).toBe(false);
  });
});
