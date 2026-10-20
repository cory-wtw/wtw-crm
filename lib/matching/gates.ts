/**
 * Hard eligibility gates. Pure functions, no I/O.
 *
 * Mirrors the lib/permissions.ts pattern: the rules live in one testable place
 * so the intake action, the review screen, and anything later can all agree on
 * who a resource will actually take.
 *
 * Boolean only. No scoring, no fuzzy matching — eligibility is not a
 * probability. Ranking (ranking.ts) runs only on what survives here.
 */

import {
  DISCHARGE_RANK,
  isMatchable,
  MIN_DISCHARGE_RANK,
  type Resource,
} from "@/lib/schemas";
import {
  milesBetween,
  placeForVeteran,
  placesForLocality,
  sameCounty,
} from "@/lib/geo/counties";
import type { MatchInput } from "./types";

export {
  GATE_FAILURES,
  GATE_FAILURE_LABELS,
  type GateFailure,
} from "./labels";
import type { GateFailure } from "./labels";

export type GateResult = {
  passes: boolean;
  /** For a local resource, how close it came — computed once here and reused
   *  by ranking. Undefined for statewide and national resources. */
  locality?: LocalityTier | null;
  /** Every gate that failed, not just the first — a resource can miss on
   *  several, and staff should see all of them at once. */
  failures: GateFailure[];
};

/**
 * Compare a resource's service locality against the city a veteran gave.
 *
 * Normalizes case, punctuation, and spacing, then matches on the whole string
 * or on a whole-word run inside it, so "Chattanooga" matches a locality
 * recorded as "Chattanooga, TN" or "Greater Chattanooga". Text only — county
 * resolution lives in localityMatch, which falls back to this.
 */
export function matchesLocality(locality: string, city: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const haystack = normalize(locality);
  const needle = normalize(city);
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;

  // Whole-word containment either way: "greater chattanooga" contains
  // "chattanooga", and a locality of "chattanooga" covers a city typed as
  // "chattanooga tn".
  const asWords = (value: string) => ` ${value} `;
  return (
    asWords(haystack).includes(asWords(needle)) ||
    asWords(needle).includes(asWords(haystack))
  );
}

/** How close a local resource comes to the veteran, nearest first. */
export const LOCALITY_TIERS = ["city", "county", "nearby", "area"] as const;
export type LocalityTier = (typeof LOCALITY_TIERS)[number];

/**
 * Straight-line miles that still count as in range: `nearby` is about a
 * neighboring county's reach (Rossville to downtown Chattanooga is 6), `area`
 * a metro's (Rossville to Cleveland, TN is 30). Past that, a local resource
 * is out of range.
 */
export const NEARBY_MILES = 25;
export const AREA_MILES = 45;

/**
 * How close a local resource's service area comes to where the veteran lives.
 *
 * `city`: one of its localities is their city. `county`: one is, or sits in,
 * their county ("Walker County", or "LaFayette" for a Rossville veteran).
 * `nearby` / `area`: the nearest listed place is within NEARBY_MILES /
 * AREA_MILES, state line or not. `null`: none — outside their area.
 */
export function localityMatch(v: MatchInput, r: Resource): LocalityTier | null {
  for (const locality of r.geoLocalities) {
    if (
      v.city &&
      v.state &&
      r.geoStates.includes(v.state) &&
      matchesLocality(locality, v.city)
    ) {
      return "city";
    }
  }

  const home = placeForVeteran({ zip: v.zip, city: v.city, state: v.state });
  if (!home) return null;

  let nearest = Infinity;
  for (const locality of r.geoLocalities) {
    for (const place of placesForLocality(locality, r.geoStates)) {
      if (sameCounty(place, home)) return "county";
      nearest = Math.min(nearest, milesBetween(place, home));
    }
  }
  if (nearest <= NEARBY_MILES) return "nearby";
  if (nearest <= AREA_MILES) return "area";
  return null;
}

/**
 * Whether a resource will take this veteran.
 *
 * Unknown answers fail closed. An unstated discharge ranks with
 * other-than-honorable (see DISCHARGE_RANK), so nothing gets recommended that
 * would turn the veteran away at the door — the review screen prompts staff to
 * confirm it before sending. Failing open means a veteran travels somewhere,
 * gets refused, and does not call back.
 */
export function passesGates(v: MatchInput, r: Resource): GateResult {
  const failures: GateFailure[] = [];

  // Nowhere safe tonight collapses everything else: only same-day intake is
  // any use, and the rest of the list can wait until they're somewhere safe.
  if (v.safeTonight === false && !r.crisisCapable) {
    return { passes: false, failures: ["not-crisis-capable"] };
  }

  let locality: LocalityTier | null | undefined;
  if (r.geoScope === "state") {
    if (!v.state || !r.geoStates.includes(v.state)) failures.push("geography");
  } else if (r.geoScope !== "national") {
    // A nearby match may cross the state line, so locality is tried first.
    locality = localityMatch(v, r);
    if (!locality) {
      failures.push(
        !v.state || !r.geoStates.includes(v.state) ? "geography" : "locality",
      );
    }
  }

  // Discharge is inclusive upward: `any` takes everyone, `general` takes
  // general and honorable, `honorable` takes honorable only.
  const need = MIN_DISCHARGE_RANK[r.minDischarge];
  const have = DISCHARGE_RANK[v.dischargeCharacter ?? "unsure"];
  if (need > have) failures.push("discharge");

  // Only a definite "no" closes this door. "unsure" might still be enrolled,
  // and guessing on their behalf costs them a resource.
  if (r.requiresVaEnrollment && v.receivingVaBenefits === "no") {
    failures.push("va-enrollment");
  }

  if (r.requiresValidId && v.idStatus !== "valid") failures.push("valid-id");

  if (
    r.eraRestriction.length > 0 &&
    !r.eraRestriction.includes(v.serviceEra ?? "unsure")
  ) {
    failures.push("era");
  }

  // Only a stated "yes" opens this one. "unsure" fails closed like every other
  // unknown: better a shorter list than a wasted trip.
  if (r.requiresDependents && v.hasDependents !== "yes") {
    failures.push("dependents");
  }

  // Only a stated membership opens this. An MST resource offered to someone who
  // never raised it is a guess about them, and a wrong one is a bad call.
  if (
    r.populationRestriction.length > 0 &&
    !r.populationRestriction.some((p) => v.situations?.includes(p))
  ) {
    failures.push("population");
  }

  if (!r.buckets.some((bucket) => v.needs.includes(bucket))) {
    failures.push("no-bucket-overlap");
  }

  // live and aging both match; aging simply ranks lower. flagged and retired
  // are withheld until a human resolves them.
  if (!isMatchable(r.verificationStatus)) failures.push("unverified");

  return { passes: failures.length === 0, failures, locality };
}

/** The resources that will take this veteran, in input order. */
export function filterByGates(
  v: MatchInput,
  resources: Resource[],
): Resource[] {
  return resources.filter((r) => passesGates(v, r).passes);
}
