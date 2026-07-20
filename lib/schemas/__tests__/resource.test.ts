import { describe, expect, it } from "vitest";
import { resourceInputSchema } from "..";

describe("resourceInputSchema", () => {
  it("requires organizationName", () => {
    const result = resourceInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a minimal resource", () => {
    const result = resourceInputSchema.safeParse({
      organizationName: "MASH",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated resource", () => {
    const result = resourceInputSchema.safeParse({
      organizationName: "MASH",
      website: "https://mash.example.org",
      contactName: "Jane Doe",
      contactPhone: "555-0100",
      contactEmail: "jane@mash.example.org",
      description: "Provides emergency housing and rent assistance.",
      eligibility: "Low-income households in Hamilton County.",
      services: "Rent assistance, utility help, food pantry",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a blank email", () => {
    const result = resourceInputSchema.safeParse({
      organizationName: "MASH",
      contactEmail: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = resourceInputSchema.safeParse({
      organizationName: "MASH",
      contactEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
