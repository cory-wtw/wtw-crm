import type { Resource } from "@/lib/schemas";
import type { MatchInput } from "../types";

/** The fixed "now" every matching test reasons from. */
export const NOW = new Date("2026-08-18T12:00:00Z");

export function daysBefore(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

/**
 * A resource that admits everyone: national, any discharge, no requirements,
 * live and freshly verified. Tests override exactly the one field under test,
 * so a failure names the gate that broke rather than a soup of defaults.
 */
export function aResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "r1",
    organizationName: "Open Door",
    website: undefined,
    contactName: undefined,
    contactPhone: undefined,
    contactEmail: undefined,
    description: undefined,
    eligibility: undefined,
    services: undefined,

    buckets: ["housing"],
    geoScope: "national",
    geoStates: [],
    geoLocalities: [],
    minDischarge: "any",
    requiresVaEnrollment: false,
    requiresValidId: false,
    eraRestriction: [],
    requiresDependents: false,
    crisisCapable: false,

    accessMethod: "phone",
    accessValue: "555-0100",
    whatToBring: undefined,
    typicalWait: "unknown",

    verificationStatus: "live",
    fragility: "stable",
    lastVerified: daysBefore(1),
    lastVerifiedBy: "uid-staff",
    contentHash: undefined,
    flagReason: undefined,
    sourceName: undefined,

    createdBy: "uid-staff",
    createdAt: daysBefore(30),
    updatedBy: "uid-staff",
    updatedAt: daysBefore(1),
    ...overrides,
  };
}

/**
 * A veteran who clears every gate: housing need, honorable, valid ID, safe
 * tonight, in Chattanooga TN.
 */
export function aVeteran(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    safeTonight: true,
    state: "TN",
    city: "Chattanooga",
    dischargeCharacter: "honorable",
    serviceEra: "post911",
    idStatus: "valid",
    hasDependents: false,
    receivingVaBenefits: "yes",
    needs: ["housing"],
    ...overrides,
  };
}
