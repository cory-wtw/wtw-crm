/**
 * Intake merge rules. Pure functions, no I/O, in the lib/permissions.ts mould.
 *
 * One rule, and it matters more than it looks: a blank answer means "not asked
 * this time", never "erase what you had". Staff runs intake on a phone call. A
 * call can end at the second question, a veteran can circle back a week later,
 * and somebody re-running the form to check one thing must not silently wipe
 * four answers a colleague collected in a better conversation.
 *
 * Clearing a stored answer is an explicit act, not the side effect of an empty
 * submit. Where uncertainty is the real answer, every field carries an
 * `unsure` value to record it — that's distinct from silence, and only one of
 * the two is worth asking about again.
 */

import { BUCKET_LABELS } from "@/lib/schemas";
import type {
  Bucket,
  DependentsAnswer,
  DischargeCharacter,
  IdStatus,
  ServiceEra,
} from "@/lib/schemas";

/** The four eligibility keys the intake writes to the veteran record. */
export type EligibilityAnswers = {
  dischargeCharacter?: DischargeCharacter;
  serviceEra?: ServiceEra;
  idStatus?: IdStatus;
  hasDependents?: DependentsAnswer;
};

export const ELIGIBILITY_FIELDS = [
  "dischargeCharacter",
  "serviceEra",
  "idStatus",
  "hasDependents",
] as const;

export type EligibilityMerge = {
  /** Only the fields that actually changed. Empty when nothing did, so the
   *  caller can skip both the write and the audit entry. */
  updates: EligibilityAnswers;
  /** What we now know, stored answers plus this call's. Feeds the matcher, so
   *  a question skipped today still matches on the answer given last week. */
  effective: EligibilityAnswers;
};

/**
 * Fold this call's answers into what the record already holds.
 *
 * An answer that came back blank leaves the stored value alone and carries it
 * into `effective`, so skipping a question narrows nothing.
 */
export function mergeEligibility(
  stored: EligibilityAnswers,
  submitted: EligibilityAnswers,
): EligibilityMerge {
  const updates: EligibilityAnswers = {};
  const effective: EligibilityAnswers = {};

  for (const field of ELIGIBILITY_FIELDS) {
    const answer = submitted[field];
    const existing = stored[field];

    if (answer === undefined) {
      // Not asked this time. Keep what we had.
      if (existing !== undefined) {
        (effective[field] as string | undefined) = existing;
      }
      continue;
    }

    (effective[field] as string | undefined) = answer;
    if (answer !== existing) {
      (updates[field] as string | undefined) = answer;
    }
  }

  return { updates, effective };
}

/**
 * The needs the matcher runs against: what staff checked, plus `crisis` when
 * the veteran has nowhere safe tonight.
 *
 * The augmentation lives here, and on the server, for one reason: what gets
 * recorded on the intake encounter is what staff checked, and this is what the
 * gates see. Those are different things. Somebody who says at question three
 * that they have nowhere to sleep needs same-day help whether or not the box
 * above it was ticked — but the record should say what they told us, not what
 * we inferred. Folding the two together would write `safeTonight` into history
 * under another name.
 */
export function matchNeeds(
  checked: Bucket[],
  safeTonight: boolean | undefined,
): Bucket[] {
  if (safeTonight !== false) return checked;
  return Array.from(new Set<Bucket>([...checked, "crisis"]));
}

/**
 * The one-line summary on an intake encounter.
 *
 * Written to be readable on a timeline six months later, when the question is
 * "what did we ask this man, and what did we have for him?" — so it names what
 * was checked and how thin the directory was, in that order.
 */
export function intakeSummary(input: {
  needs: Bucket[];
  candidatesFound: number;
  consideredCount: number;
}): string {
  const checked =
    input.needs.length > 0
      ? `Checked: ${input.needs.map((b) => BUCKET_LABELS[b]).join(", ")}.`
      : "Nothing checked.";

  const pool = `${input.consideredCount} ${
    input.consideredCount === 1 ? "resource" : "resources"
  }`;
  const matched =
    input.candidatesFound === 0
      ? `None of ${pool} matched.`
      : `${input.candidatesFound} of ${pool} matched.`;

  return `${checked} ${matched}`;
}
