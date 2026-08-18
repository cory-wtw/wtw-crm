import { z } from "zod";
import { bucketSchema } from "./bucket";

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
export const ENCOUNTER_TYPES = ["note", "referral", "followUp"] as const;
export const encounterTypeSchema = z.enum(ENCOUNTER_TYPES);
export type EncounterType = z.infer<typeof encounterTypeSchema>;

export const ENCOUNTER_TYPE_LABELS: Record<EncounterType, string> = {
  note: "Encounter",
  referral: "Referral",
  followUp: "Follow-up",
};

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

  // Referral encounters only. Empty on a plain note.
  bucketsIdentified: z.array(bucketSchema).default([]),
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
  referrals: true,
  followUpDue: true,
  followUpCompleted: true,
  outcomes: true,
  createdAt: true,
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
