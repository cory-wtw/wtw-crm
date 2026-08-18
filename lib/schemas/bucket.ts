import { z } from "zod";

/**
 * The eleven need buckets. This is the vocabulary the matching engine works
 * in: a resource declares which buckets it serves, an intake records which
 * buckets a veteran needs, and a resource only matches when the two overlap.
 *
 * Bucket codes are internal. They are never shown to a veteran — the labels
 * are for staff-facing UI, and BUCKET_PROMPTS holds the read-aloud phrasing
 * the intake form uses so the person on the call hears plain language rather
 * than our filing system.
 */

export const BUCKET_CODES = [
  "crisis",
  "housing",
  "essentials",
  "health",
  "mental",
  "claims",
  "income",
  "work",
  "legal",
  "family",
  "transport",
] as const;

export const bucketSchema = z.enum(BUCKET_CODES);
export type Bucket = z.infer<typeof bucketSchema>;

/** Staff-facing names. Used on resource records and admin screens. */
export const BUCKET_LABELS: Record<Bucket, string> = {
  crisis: "Crisis",
  housing: "Housing",
  essentials: "Food & Essentials",
  health: "Health Care",
  mental: "Mental Health & Recovery",
  claims: "VA Benefits & Claims",
  income: "Income & Assistance",
  work: "Work & School",
  legal: "Legal & Records",
  family: "Family & Caregiving",
  transport: "Getting There",
};

/**
 * What the staff member says out loud during intake. These are the checkbox
 * labels on the intake form — the bucket name means nothing to a veteran, the
 * question does.
 */
export const BUCKET_PROMPTS: Record<Bucket, string> = {
  crisis:
    "Is tonight the problem? Nowhere safe to sleep, or you're in danger, or you're in a bad place mentally right now.",
  housing:
    "Do you need somewhere to live, or are you about to lose where you're at?",
  essentials: "Food, clothes, hygiene stuff, anything for the house.",
  health:
    "Do you need to see a doctor or a dentist? Includes getting signed up with the VA if you never did.",
  mental:
    "Somebody to talk to. Counseling, PTSD, drinking or using, or just another veteran who gets it.",
  claims:
    "Have you ever filed for disability with the VA? If you haven't, or you filed and got turned down, that's a yes.",
  income:
    "Money coming in. Social Security, food stamps, help with the light bill or the rent, somebody to help with debt.",
  work: "Looking for work, going back to school, getting a certification, or starting something of your own.",
  legal:
    "Do you have a valid ID? Do you have your DD-214? Anything with a discharge upgrade or a court date also goes here.",
  family:
    "Anybody depending on you, or anybody taking care of you. Kids, a spouse, an aging parent.",
  transport:
    "How you get around and how people reach you. A ride, a bus pass, a phone, internet.",
};

/**
 * Service eras. Lives here rather than in veteran.ts because both sides of the
 * match need it: a veteran states one, a resource may restrict to a set.
 */
export const SERVICE_ERAS = [
  "post911",
  "gulf",
  "vietnam",
  "pre911",
  "other",
  "unsure",
] as const;

export const serviceEraSchema = z.enum(SERVICE_ERAS);
export type ServiceEra = z.infer<typeof serviceEraSchema>;

export const SERVICE_ERA_LABELS: Record<ServiceEra, string> = {
  post911: "Post-9/11",
  gulf: "Gulf War",
  vietnam: "Vietnam",
  pre911: "Pre-9/11 (other)",
  other: "Other",
  unsure: "Not sure",
};

/**
 * Character of discharge. Shared for the same reason as SERVICE_ERAS: the
 * veteran states one, the resource sets a floor.
 *
 * Order matters — see DISCHARGE_RANK.
 */
export const DISCHARGE_CHARACTERS = [
  "honorable",
  "general",
  "other",
  "unsure",
] as const;

export const dischargeCharacterSchema = z.enum(DISCHARGE_CHARACTERS);
export type DischargeCharacter = z.infer<typeof dischargeCharacterSchema>;

export const DISCHARGE_CHARACTER_LABELS: Record<DischargeCharacter, string> = {
  honorable: "Honorable",
  general: "General",
  other: "Other than honorable",
  unsure: "Not sure",
};

/**
 * The floor a resource sets on character of discharge. Inclusive upward:
 * `any` accepts everything including other-than-honorable, `general` accepts
 * general and honorable, `honorable` accepts honorable only.
 */
export const MIN_DISCHARGES = ["any", "general", "honorable"] as const;
export const minDischargeSchema = z.enum(MIN_DISCHARGES);
export type MinDischarge = z.infer<typeof minDischargeSchema>;

export const MIN_DISCHARGE_LABELS: Record<MinDischarge, string> = {
  any: "Any discharge, including other-than-honorable",
  general: "General or better",
  honorable: "Honorable only",
};

/**
 * Numeric ranks backing the discharge gate. A resource admits a veteran when
 * DISCHARGE_RANK[veteran] >= MIN_DISCHARGE_RANK[resource].
 *
 * `unsure` ranks with `other` on purpose: an unknown discharge fails closed, so
 * we never send someone to a door that turns them away. The intake flags it for
 * confirmation instead. Getting this backwards on Vet Center records would hide
 * the single most useful resource for this population, since Vet Centers accept
 * any character of discharge.
 *
 * The gate itself lands in lib/matching/gates.ts in Phase 2; the ranks live here
 * so the two enums that define them can't drift apart.
 */
export const DISCHARGE_RANK: Record<DischargeCharacter, number> = {
  other: 0,
  unsure: 0,
  general: 1,
  honorable: 2,
};

export const MIN_DISCHARGE_RANK: Record<MinDischarge, number> = {
  any: 0,
  general: 1,
  honorable: 2,
};
