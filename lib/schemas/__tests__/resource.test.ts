import { describe, expect, it } from "vitest";
import {
  AGING_AFTER_DAYS,
  STALE_AFTER_DAYS,
  derivedVerificationStatus,
  isMatchable,
  resourceInputSchema,
} from "..";

/** A date `days` before the fixed "now" the tests below use. */
const NOW = new Date("2026-08-18T12:00:00Z");
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

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

  it("defaults an unclassified record to permissive gates", () => {
    const result = resourceInputSchema.parse({ organizationName: "MASH" });
    // Nothing is restricted by a value nobody has filled in yet...
    expect(result.geoScope).toBe("national");
    expect(result.minDischarge).toBe("any");
    expect(result.requiresVaEnrollment).toBe(false);
    expect(result.requiresValidId).toBe(false);
    expect(result.requiresDependents).toBe(false);
    expect(result.eraRestriction).toEqual([]);
    // ...but with no buckets it still matches nothing, which is correct:
    // we don't know what it serves.
    expect(result.buckets).toEqual([]);
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
      buckets: ["housing", "essentials"],
      geoScope: "county",
      geoStates: ["TN"],
      geoLocalities: ["Hamilton County"],
      minDischarge: "any",
      requiresVaEnrollment: false,
      requiresValidId: true,
      eraRestriction: [],
      requiresDependents: false,
      crisisCapable: true,
      accessMethod: "walkin",
      accessValue: "1400 Market St, Chattanooga TN",
      whatToBring: "Photo ID, DD-214",
      typicalWait: "sameday",
      verificationStatus: "live",
      fragility: "fragile",
      sourceName: "SSVF grantee list",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown bucket", () => {
    const result = resourceInputSchema.safeParse({
      organizationName: "MASH",
      buckets: ["housing", "kittens"],
    });
    expect(result.success).toBe(false);
  });

  it("omits server-managed verification stamps", () => {
    const result = resourceInputSchema.parse({
      organizationName: "MASH",
      lastVerified: new Date(),
      lastVerifiedBy: "someone",
      contentHash: "abc",
      flagReason: "spoofed",
    });
    expect(result).not.toHaveProperty("lastVerified");
    expect(result).not.toHaveProperty("lastVerifiedBy");
    expect(result).not.toHaveProperty("contentHash");
    expect(result).not.toHaveProperty("flagReason");
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

describe("derivedVerificationStatus", () => {
  it("keeps a freshly verified record live", () => {
    expect(derivedVerificationStatus("live", daysAgo(1), NOW)).toBe("live");
    expect(
      derivedVerificationStatus("live", daysAgo(AGING_AFTER_DAYS - 1), NOW),
    ).toBe("live");
  });

  it("ages a live record at 90 days", () => {
    expect(
      derivedVerificationStatus("live", daysAgo(AGING_AFTER_DAYS), NOW),
    ).toBe("aging");
    expect(derivedVerificationStatus("live", daysAgo(120), NOW)).toBe("aging");
  });

  it("never flags on age alone — a stale record stays aging and stays matchable", () => {
    // Only a human action or a Phase 7 check may set flagged, and both write a
    // verifications doc. A clock running out is neither.
    expect(
      derivedVerificationStatus("live", daysAgo(STALE_AFTER_DAYS), NOW),
    ).toBe("aging");
    expect(derivedVerificationStatus("live", daysAgo(2000), NOW)).toBe("aging");
    expect(derivedVerificationStatus("aging", daysAgo(2000), NOW)).toBe(
      "aging",
    );
    expect(isMatchable(derivedVerificationStatus("live", daysAgo(2000), NOW))).toBe(
      true,
    );
  });

  it("leaves human and verifier states alone", () => {
    expect(derivedVerificationStatus("flagged", daysAgo(1), NOW)).toBe(
      "flagged",
    );
    expect(derivedVerificationStatus("retired", daysAgo(1000), NOW)).toBe(
      "retired",
    );
  });

  it("leaves a never-verified record as stored", () => {
    expect(derivedVerificationStatus("live", null, NOW)).toBe("live");
  });
});

describe("isMatchable", () => {
  it("suggests only live and aging records", () => {
    expect(isMatchable("live")).toBe(true);
    expect(isMatchable("aging")).toBe(true);
    expect(isMatchable("flagged")).toBe(false);
    expect(isMatchable("retired")).toBe(false);
  });
});
