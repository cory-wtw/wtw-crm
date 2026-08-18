/**
 * VA Facilities API → resource record. Pure functions, no I/O, so the mapping
 * that decides who sees these resources is testable without a network call.
 *
 * Gate values are mapped BY FACILITY TYPE, not per record. The API tells us
 * what kind of place this is and where it is; it says nothing about discharge
 * floors or ID requirements, and inventing a per-record answer from a name
 * string would be guessing dressed as data.
 *
 * Every record this produces is written `flagged`, so nothing here reaches a
 * veteran until a person has looked at it.
 */

import type {
  AccessMethod,
  Bucket,
  MinDischarge,
  TypicalWait,
} from "@/lib/schemas";

/** The three facility types this importer pulls. */
export const VA_FACILITY_TYPES = ["health", "vet_center", "benefits"] as const;
export type VaFacilityType = (typeof VA_FACILITY_TYPES)[number];

/** The shape we use out of the API's facility attributes. */
export type VaFacility = {
  id: string;
  attributes: {
    name?: string | null;
    facilityType?: string | null;
    classification?: string | null;
    website?: string | null;
    phone?: { main?: string | null } | null;
    address?: {
      physical?: {
        address1?: string | null;
        address2?: string | null;
        address3?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
      } | null;
    } | null;
  };
};

export type GateMapping = {
  buckets: Bucket[];
  minDischarge: MinDischarge;
  requiresVaEnrollment: boolean;
  requiresValidId: boolean;
  crisisCapable: boolean;
  typicalWait: TypicalWait;
  /** How a veteran starts, before we know whether a phone number exists. */
  preferredAccess: AccessMethod;
  description: string;
};

/**
 * One mapping per facility type.
 *
 * GUESSES, flagged for review — the API supplies none of these:
 *
 * - `buckets`. Assigned from what the facility type does, not from any field.
 *   Vet Centers get mental + health because readjustment counselling is their
 *   whole remit and they also do referrals; health facilities get health, and
 *   mental too because every VA medical centre has behavioural health.
 *   Benefits offices get claims. Nothing here claims Housing or Legal even
 *   though some sites host those services, because a veteran sent to the wrong
 *   desk is worse served than one we never sent.
 * - `minDischarge` is "any" everywhere except where the spec states otherwise.
 *   VA health and benefits eligibility for other-than-honorable discharges
 *   turns on a character-of-discharge determination, which is exactly the kind
 *   of judgement this system must not make. "any" fails open, and the door
 *   staff decides.
 * - `requiresValidId` false everywhere. Federal facilities generally want photo
 *   ID to enter, but that is a building-access fact rather than an eligibility
 *   gate, and treating it as a gate would hide every VA facility from the
 *   veterans most likely to have lost their ID.
 * - `crisisCapable` false everywhere, including Vet Centers, which do take
 *   walk-ins. Same-day intake is a promise, and over-claiming it sends someone
 *   with nowhere to sleep to a door that may not open tonight. A reviewer who
 *   knows a given site can flip it.
 * - `typicalWait` "unknown". The API has no wait data and inventing one would
 *   move records up the ranking on a fiction.
 */
export const TYPE_MAPPING: Record<VaFacilityType, GateMapping> = {
  vet_center: {
    buckets: ["mental", "health"],
    // Stated in the brief, and true: Vet Centers accept any character of
    // discharge and require no VA enrollment. Getting this wrong would hide
    // the single most useful resource for this population.
    minDischarge: "any",
    requiresVaEnrollment: false,
    requiresValidId: false,
    crisisCapable: false,
    typicalWait: "unknown",
    preferredAccess: "walkin",
    description:
      "Vet Center. Counselling and readjustment support for veterans and their families.",
  },
  health: {
    buckets: ["health", "mental"],
    minDischarge: "any",
    // Stated in the brief: VA medical facilities serve enrolled veterans.
    requiresVaEnrollment: true,
    requiresValidId: false,
    crisisCapable: false,
    typicalWait: "unknown",
    preferredAccess: "phone",
    description: "VA health facility.",
  },
  benefits: {
    buckets: ["claims"],
    minDischarge: "any",
    requiresVaEnrollment: false,
    requiresValidId: false,
    crisisCapable: false,
    typicalWait: "unknown",
    preferredAccess: "phone",
    description: "VA regional benefits office.",
  },
};

/** Namespaced so a VA id can never collide with another source's. */
export function externalIdFor(facilityId: string): string {
  return `va-facilities:${facilityId}`;
}

/**
 * A postal address, or "" when there's no street line.
 *
 * City and state alone are not somewhere a veteran can walk into, and
 * "walk in at Chattanooga, TN" is worse than no instruction at all — so a
 * record without a street line has no walk-in channel.
 */
function joinAddress(
  physical: NonNullable<
    NonNullable<VaFacility["attributes"]["address"]>["physical"]
  >,
): string {
  if (!physical.address1?.trim()) return "";
  return [
    physical.address1,
    physical.address2,
    physical.address3,
    [physical.city, physical.state].filter(Boolean).join(", "),
    physical.zip,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export type MappedFacility = {
  externalId: string;
  state: string;
  /** Fields the API owns and a re-run should refresh. */
  facts: {
    organizationName: string;
    website?: string;
    contactPhone?: string;
    accessMethod: AccessMethod;
    accessValue?: string;
    geoScope: "state";
    geoStates: string[];
    geoLocalities: string[];
    description: string;
  };
  /** Fields the type mapping owns, applied on create and on an explicit remap. */
  gates: {
    buckets: Bucket[];
    minDischarge: MinDischarge;
    requiresVaEnrollment: boolean;
    requiresValidId: boolean;
    requiresDependents: boolean;
    eraRestriction: never[];
    crisisCapable: boolean;
    typicalWait: TypicalWait;
  };
};

/**
 * Map one facility, or null when it can't be placed.
 *
 * A facility with no state is dropped rather than written nationally: the
 * geography gate reads `geoStates`, so a stateless record either matches
 * nobody or, written as national, matches everybody. Both are worse than a
 * line in the import report.
 */
export function mapFacility(
  facility: VaFacility,
  type: VaFacilityType,
): MappedFacility | null {
  const attributes = facility.attributes ?? {};
  const physical = attributes.address?.physical ?? null;
  const state = physical?.state?.trim().toUpperCase() ?? "";
  const name = attributes.name?.trim() ?? "";
  if (!name || state.length !== 2) return null;

  const mapping = TYPE_MAPPING[type];
  const phone = attributes.phone?.main?.trim() || undefined;
  const address = physical ? joinAddress(physical) : "";

  // Prefer the type's own front door, but never point a veteran at a channel
  // the record hasn't got.
  const canWalkIn = address.length > 0;
  const accessMethod: AccessMethod =
    mapping.preferredAccess === "walkin" && canWalkIn
      ? "walkin"
      : phone
        ? "phone"
        : canWalkIn
          ? "walkin"
          : "web";
  const accessValue =
    accessMethod === "walkin"
      ? address
      : accessMethod === "phone"
        ? phone
        : (attributes.website?.trim() ?? undefined);

  const classification = attributes.classification?.trim();

  return {
    externalId: externalIdFor(facility.id),
    state,
    facts: {
      organizationName: name,
      website: attributes.website?.trim() || undefined,
      contactPhone: phone,
      accessMethod,
      accessValue: accessValue || undefined,
      geoScope: "state",
      geoStates: [state],
      geoLocalities: [],
      // Classification is a plain noun phrase like "Multi-Specialty CBOC";
      // safe to pass through, and it tells a reviewer what kind of site this
      // is without another lookup.
      description: classification
        ? `${mapping.description} ${classification}.`
        : mapping.description,
    },
    gates: {
      buckets: mapping.buckets,
      minDischarge: mapping.minDischarge,
      requiresVaEnrollment: mapping.requiresVaEnrollment,
      requiresValidId: mapping.requiresValidId,
      requiresDependents: false,
      eraRestriction: [],
      crisisCapable: mapping.crisisCapable,
      typicalWait: mapping.typicalWait,
    },
  };
}
