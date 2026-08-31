import { z } from "zod";
import {
  bucketSchema,
  dischargeCharacterSchema,
  serviceEraSchema,
} from "./bucket";
import { dependentsAnswerSchema, idStatusSchema } from "./veteran";

/**
 * What kind of interaction this was.
 *
 * Referrals and follow-ups are encounters rather than collections of their own:
 * the timeline on a veteran record is already the single history of everything
 * that happened to them, and a separate `matches` collection would mean a
 * foreign key nobody maintains. This codebase already carries two of those
 * (`vso.referralsMade` never increments, `phone.assignedVeteranId` never
 * syncs); a third would compound the weakness rather than isolate it.
 */
export const ENCOUNTER_TYPES = [
  "note",
  "intake",
  "referral",
  "followUp",
] as const;
export const encounterTypeSchema = z.enum(ENCOUNTER_TYPES);
export type EncounterType = z.infer<typeof encounterTypeSchema>;

export const ENCOUNTER_TYPE_LABELS: Record<EncounterType, string> = {
  note: "Encounter",
  intake: "Intake",
  referral: "Referral",
  followUp: "Follow-up",
};

/**
 * The eligibility picture the matcher ran against, recorded on an intake
 * encounter.
 *
 * Not the same thing as what was asked on the call: it's stored answers plus
 * this call's, which is exactly what the gates saw. When an intake comes back
 * with nobody on the list, this is the half of the answer the directory can't
 * give you.
 *
 * What is deliberately absent: `safeTonight` and `receivingVaBenefits`. A
 * crisis answer is true at a moment, not about a person, and claim status is
 * on the never-stored list. Both route the call and then go away.
 */
export const intakeAnswersSchema = z.object({
  dischargeCharacter: dischargeCharacterSchema.optional(),
  serviceEra: serviceEraSchema.optional(),
  idStatus: idStatusSchema.optional(),
  hasDependents: dependentsAnswerSchema.optional(),
});
export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

/**
 * One resource in a referral packet, denormalized at the moment it was sent.
 *
 * `resourceName` is a snapshot on purpose: the packet is a record of what the
 * veteran was actually handed, and an organization renaming itself later must
 * not rewrite history. `rank` and `score` record where the matcher put it on
 * the list staff saw.
 */
export const referredResourceSchema = z.object({
  resourceId: z.string().min(1),
  resourceName: z.string().min(1),
  rank: z.number().int().nonnegative(),
  score: z.number(),
});
export type ReferredResource = z.infer<typeof referredResourceSchema>;

/**
 * What came of one referred resource, two weeks on.
 *
 * This is the most valuable verification signal in the system: no crawler can
 * tell you a phone number is dead, and a veteran who tried can.
 */
export const FOLLOW_UP_OUTCOMES = [
  "reached",
  "unreachable",
  "ineligible",
  "declined",
  "helped",
] as const;
export const followUpOutcomeSchema = z.enum(FOLLOW_UP_OUTCOMES);
export type FollowUpOutcome = z.infer<typeof followUpOutcomeSchema>;

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  reached: "Got through",
  unreachable: "Couldn't reach them",
  ineligible: "Turned away — didn't qualify",
  declined: "Veteran decided not to",
  helped: "They helped",
};

export const followUpResultSchema = z.object({
  resourceId: z.string().min(1),
  outcome: followUpOutcomeSchema,
  note: z.string().optional(),
});
export type FollowUpResult = z.infer<typeof followUpResultSchema>;

export const encounterSchema = z.object({
  id: z.string(),
  type: encounterTypeSchema.default("note"),
  occurredAt: z.date(),
  loggedBy: z.string(),
  location: z.string().optional(),
  summary: z.string().min(1, "Required"),
  nextStep: z.string().optional(),
  nextStepDueAt: z.date().nullable().default(null),

  // Intake and referral encounters. Empty on a plain note.
  //
  // What staff actually checked on the call, not what the matcher was handed:
  // a crisis answer adds `crisis` to the matcher's needs, and that derivation
  // is a routing decision rather than something the veteran said.
  bucketsIdentified: z.array(bucketSchema).default([]),

  // Intake encounters only.
  intakeAnswers: intakeAnswersSchema.default({}),
  /**
   * Which of the checked buckets had at least one resource clear the gates.
   *
   * Null means the run predates this field, not that nothing matched — the
   * difference decides whether a bucket counts as a gap, so silence has to
   * stay distinguishable from a "no". `candidatesFound: 0` is the one case
   * where a null still tells you everything: nothing matched at all.
   */
  bucketsMatched: z.array(bucketSchema).nullable().default(null),
  /** How many resources cleared the gates. Zero is the interesting number:
   *  it's a hole in the directory, and it only shows up here. */
  candidatesFound: z.number().int().nonnegative().nullable().default(null),

  // Referral encounters only.
  referrals: z.array(referredResourceSchema).default([]),
  followUpDue: z.date().nullable().default(null),
  followUpCompleted: z.date().nullable().default(null),

  // followUp encounters only.
  outcomes: z.array(followUpResultSchema).default([]),

  createdAt: z.date(),
});
export type Encounter = z.infer<typeof encounterSchema>;

/** Fields a user types when logging a plain encounter by hand. */
export const encounterInputSchema = encounterSchema.omit({
  id: true,
  type: true,
  loggedBy: true,
  bucketsIdentified: true,
  intakeAnswers: true,
  bucketsMatched: true,
  candidatesFound: true,
  referrals: true,
  followUpDue: true,
  followUpCompleted: true,
  outcomes: true,
  createdAt: true,
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
