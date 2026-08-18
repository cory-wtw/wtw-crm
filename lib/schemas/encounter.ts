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
  createdAt: true,
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
