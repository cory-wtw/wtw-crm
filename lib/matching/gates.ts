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
import type { MatchInput } from "./types";

/** Why a resource was excluded. Codes, so the review screen can label them. */
export const GATE_FAILURES = [
  "not-crisis-capable",
  "geography",
  "locality",
  "discharge",
  "va-enrollment",
  "valid-id",
  "era",
  "dependents",
  "no-bucket-overlap",
  "unverified",
] as const;
export type GateFailure = (typeof GATE_FAILURES)[number];

/** Staff-facing reasons, for the "why was this excluded" list in Phase 3. */
export const GATE_FAILURE_LABELS: Record<GateFailure, string> = {
  "not-crisis-capable": "No same-day intake",
  geography: "Outside their service area",
  locality: "Outside their city or county",
  discharge: "Discharge doesn't meet their floor",
  "va-enrollment": "Requires VA enrollment",
  "valid-id": "Requires a valid ID",
  era: "Restricted to other service eras",
  dependents: "Requires dependents",
  "no-bucket-overlap": "Doesn't cover what they need",
  unverified: "Record not verified",
};

export type GateResult = {
  passes: boolean;
  /** Every gate that failed, not just the first — a resource can miss on
   *  several, and staff should see all of them at once. */
  failures: GateFailure[];
};

/**
 * Compare a resource's service locality against the city a veteran gave.
 *
 * Normalizes case, punctuation, and spacing, then matches on the whole string
 * or on a whole-word run inside it, so "Chattanooga" matches a locality
 * recorded as "Chattanooga, TN" or "Greater Chattanooga". It does NOT know
 * that Chattanooga sits in Hamilton County — city-to-county resolution needs a
 * lookup table this system doesn't have, so a county-scoped resource must list
 * the cities it covers. Phase 0 is where that shows up.
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

  if (r.geoScope !== "national") {
    if (!v.state || !r.geoStates.includes(v.state)) {
      failures.push("geography");
    } else if (r.geoScope !== "state") {
      if (
        !v.city ||
        !r.geoLocalities.some((locality) => matchesLocality(locality, v.city!))
      ) {
        failures.push("locality");
      }
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

  if (r.requiresDependents && v.hasDependents !== true) {
    failures.push("dependents");
  }

  if (!r.buckets.some((bucket) => v.needs.includes(bucket))) {
    failures.push("no-bucket-overlap");
  }

  // live and aging both match; aging simply ranks lower. flagged and retired
  // are withheld until a human resolves them.
  if (!isMatchable(r.verificationStatus)) failures.push("unverified");

  return { passes: failures.length === 0, failures };
}

/** The resources that will take this veteran, in input order. */
export function filterByGates(
  v: MatchInput,
  resources: Resource[],
): Resource[] {
  return resources.filter((r) => passesGates(v, r).passes);
}
