/**
 * Gate failure codes and their labels. Split from gates.ts so a client screen
 * can show the labels without pulling in the ZIP data the gates read.
 */

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
  "population",
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
  population: "Only serves a group they're not in",
  "no-bucket-overlap": "Doesn't cover what they need",
  unverified: "Record not verified",
};
