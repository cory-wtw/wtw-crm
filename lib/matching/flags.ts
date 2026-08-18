/**
 * Warnings the review screen shows next to a candidate. Pure functions, no I/O.
 *
 * A flag never excludes anything — gates do that. A flag is what a staff member
 * should check before sending, because the matcher made an assumption on thin
 * evidence and only a person can resolve it.
 */

import { isMatchable, type Resource } from "@/lib/schemas";
import type { MatchInput } from "./types";

export const MATCH_FLAGS = [
  "confirm-discharge",
  "confirm-location",
  "aging-record",
  "referral-required",
] as const;
export type MatchFlag = (typeof MATCH_FLAGS)[number];

/** What staff sees. Written as the thing to do, not the condition detected. */
export const MATCH_FLAG_LABELS: Record<MatchFlag, string> = {
  "confirm-discharge": "Confirm discharge before sending",
  "confirm-location": "Confirm they can get there",
  "aging-record": "Verify this is still running",
  "referral-required": "Needs a referral to get in",
};

/**
 * Flags that apply to the whole short list rather than one resource.
 *
 * An unknown discharge fails closed at the gates, so anything requiring a
 * discharge floor was already dropped. What's left may be a shorter list than
 * the veteran deserves, and a two-second question fixes it — hence the flag on
 * the list as a whole, not on individual cards.
 */
export function intakeFlags(v: MatchInput): MatchFlag[] {
  const flags: MatchFlag[] = [];
  if (!v.dischargeCharacter || v.dischargeCharacter === "unsure") {
    flags.push("confirm-discharge");
  }
  if (!v.state) flags.push("confirm-location");
  return flags;
}

/** Flags for one candidate, given who we're sending. */
export function resourceFlags(v: MatchInput, r: Resource): MatchFlag[] {
  const flags: MatchFlag[] = [];

  // Aging records still match — they just haven't been confirmed in 90 days,
  // and a staff member about to send someone there is the cheapest check we
  // have.
  if (isMatchable(r.verificationStatus) && r.verificationStatus === "aging") {
    flags.push("aging-record");
  }

  // Not a gate: plenty of good programs take referrals, but staff needs to know
  // the veteran can't just walk in or call.
  if (r.accessMethod === "referral") flags.push("referral-required");

  return flags;
}
