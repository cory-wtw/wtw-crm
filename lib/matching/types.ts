import type { Bucket, DischargeCharacter, ServiceEra } from "@/lib/schemas";

/**
 * Whether the veteran has ever filed with the VA. `no` and `unsure` both flag
 * the claims lane; only `no` closes the door on a resource that requires VA
 * enrollment, because an unsure answer might still be enrolled.
 *
 * Defined here rather than on the veteran schema because Phase 2 changes no
 * schemas. Phase 3 adds the intake fields to `veteranSchema`; when it does,
 * this and `IdStatus` should narrow to those enums rather than sit beside them.
 */
export type ReceivingVaBenefits = "yes" | "no" | "unsure";

/** Whether they have a current state ID or licence on them. */
export type IdStatus = "valid" | "expired" | "none";

/**
 * Everything the matcher knows about a veteran. Assembled by the intake form,
 * never read from the database directly — the matching engine does no I/O.
 *
 * Every field except `needs` is optional, because a call can end early and a
 * half-finished intake still has to produce a usable short list. Missing
 * answers fail closed at the gates rather than opening doors that will turn
 * the veteran away.
 */
export type MatchInput = {
  /**
   * False when the veteran has nowhere safe to sleep, is in danger, or is in
   * crisis right now. Deliberately transient — it is true at a moment, not
   * about a person, and is never persisted to the veteran record.
   *
   * Undefined means unasked, which is not the same as safe.
   */
  safeTonight?: boolean;

  /** Two-letter state code, matched against a resource's `geoStates`. */
  state?: string;
  city?: string;

  dischargeCharacter?: DischargeCharacter;
  serviceEra?: ServiceEra;
  idStatus?: IdStatus;
  hasDependents?: boolean;
  receivingVaBenefits?: ReceivingVaBenefits;

  /** The buckets checked during intake. A resource must serve at least one. */
  needs: Bucket[];
};
