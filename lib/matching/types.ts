import type {
  Bucket,
  DependentsAnswer,
  DischargeCharacter,
  IdStatus,
  ReceivingVaBenefits,
  ServiceEra,
} from "@/lib/schemas";

// IdStatus and ReceivingVaBenefits come from the veteran schema rather than
// being redeclared here: the intake form writes the first to the veteran record
// and asks the second without storing it, and both must mean exactly the same
// thing to the form and to the gates.

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
  hasDependents?: DependentsAnswer;
  receivingVaBenefits?: ReceivingVaBenefits;

  /** The buckets checked during intake. A resource must serve at least one. */
  needs: Bucket[];
};
