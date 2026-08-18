import { z } from "zod";
import { dischargeCharacterSchema, serviceEraSchema } from "./bucket";
import {
  pipelineHistoryEntrySchema,
  pipelineStageSchema,
} from "./pipeline";

// How a veteran prefers to be reached. We store exactly one channel per
// veteran (data minimization): whichever they choose is the only contact
// value kept on the record.
export const PREFERRED_CONTACT_METHODS = ["phone", "email"] as const;
export const preferredContactSchema = z.enum(PREFERRED_CONTACT_METHODS);
export type PreferredContact = z.infer<typeof preferredContactSchema>;
export const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: "Phone",
  email: "Email",
};

/**
 * Whether they have a current state ID or driver's licence on them. Expired
 * counts as its own answer — it changes which doors open, and it's the single
 * most common thing blocking a voucher, a job, and a bank account.
 *
 * `unsure` exists so uncertainty is recordable and distinct from silence. A
 * blank field means nobody asked; `unsure` means somebody asked and the answer
 * was "I don't know". Both fail closed at the gates, but only one of them is
 * worth asking again.
 */
export const ID_STATUSES = ["valid", "expired", "none", "unsure"] as const;
export const idStatusSchema = z.enum(ID_STATUSES);
export type IdStatus = z.infer<typeof idStatusSchema>;

export const ID_STATUS_LABELS: Record<IdStatus, string> = {
  valid: "Has a current ID",
  expired: "Has one, expired",
  none: "No ID",
  unsure: "Not sure",
};

/**
 * Whether anybody depends on them. A tri-state rather than a boolean for the
 * same reason as `idStatus`: custody and caregiving are genuinely unclear to
 * plenty of people on a first call, and "I don't know" is an answer worth
 * keeping. Legacy boolean values read forward in lib/db/veterans.ts.
 */
export const DEPENDENTS_ANSWERS = ["yes", "no", "unsure"] as const;
export const dependentsAnswerSchema = z.enum(DEPENDENTS_ANSWERS);
export type DependentsAnswer = z.infer<typeof dependentsAnswerSchema>;

export const DEPENDENTS_ANSWER_LABELS: Record<DependentsAnswer, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
};

/**
 * Where this veteran sits in the concierge loop. Deliberately a separate axis
 * from `pipelineStage`, which tracks a claim: someone who receives five program
 * referrals never files anything and would otherwise sit at `connected`
 * forever, skewing the stage counts. A veteran can be `connected` on the claims
 * pipeline and `closed` on concierge at the same time.
 */
export const CONCIERGE_STATUSES = [
  "none",
  "referred",
  "followUpDue",
  "closed",
] as const;
export const conciergeStatusSchema = z.enum(CONCIERGE_STATUSES);
export type ConciergeStatus = z.infer<typeof conciergeStatusSchema>;

export const CONCIERGE_STATUS_LABELS: Record<ConciergeStatus, string> = {
  none: "Not started",
  referred: "Referred",
  followUpDue: "Follow-up due",
  closed: "Closed",
};

/**
 * Whether the veteran has ever filed with the VA. Asked at intake to route the
 * claims lane to an accredited partner — the system never assesses a claim.
 *
 * Deliberately NOT a field on `veteranSchema`: claim history detail is on the
 * "not stored, ever" list. The enum lives here so the intake form and the
 * matcher share one definition of the answer.
 */
export const RECEIVING_VA_BENEFITS = ["yes", "no", "unsure"] as const;
export const receivingVaBenefitsSchema = z.enum(RECEIVING_VA_BENEFITS);
export type ReceivingVaBenefits = z.infer<typeof receivingVaBenefitsSchema>;

export const RECEIVING_VA_BENEFITS_LABELS: Record<
  ReceivingVaBenefits,
  string
> = {
  yes: "Yes, receiving benefits",
  no: "No, never filed or was turned down",
  unsure: "Not sure",
};

const currentYear = new Date().getFullYear();

export const veteranSchema = z.object({
  id: z.string(),

  // Identity — reduced to a first name and a single last initial. The full
  // last name is intentionally not stored.
  firstName: z.string().min(1, "Required"),
  lastInitial: z
    .string()
    .max(1, "One letter only")
    .transform((s) => s.toUpperCase())
    .optional()
    .or(z.literal("")),

  // Contact — one channel only. `preferredContact` says which of phone/email
  // is on file; the matching field below holds the value, the other is blank.
  preferredContact: preferredContactSchema.default("phone"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),

  // Demographics
  birthYear: z
    .number()
    .int()
    .min(1900, "Too far back")
    .max(currentYear, "Future year")
    .optional(),

  // Location
  city: z.string().optional(),
  state: z.string().optional(),

  // Eligibility keys, captured at intake. All optional — a call can end early,
  // and a half-finished intake still has to leave a usable record. Every one of
  // them is a routing fact, not a health or money fact: they decide which doors
  // open, nothing more.
  //
  // `safeTonight` is deliberately absent. A crisis answer is true at a moment,
  // not about a person, and a stale `safeTonight: false` read three months
  // later is worse than no data at all. It stays form state.
  dischargeCharacter: dischargeCharacterSchema.optional(),
  serviceEra: serviceEraSchema.optional(),
  idStatus: idStatusSchema.optional(),
  hasDependents: dependentsAnswerSchema.optional(),

  // Concierge loop. Written by the referral and follow-up actions, never typed
  // into a form.
  conciergeStatus: conciergeStatusSchema.optional(),
  followUpDue: z.date().nullable().default(null),

  // Ownership
  assigneeUid: z.string().nullable().default(null),

  // Pipeline
  pipelineStage: pipelineStageSchema.default("found"),
  pipelineHistory: z.array(pipelineHistoryEntrySchema).default([]),
  dateFound: z.date().nullable().default(null),
  dateConnected: z.date().nullable().default(null),
  dateFiled: z.date().nullable().default(null),
  dateWon: z.date().nullable().default(null),
  dateLost: z.date().nullable().default(null),

  // Monthly VA benefit, in dollars. `before` is what they were receiving
  // before WTW got involved (usually 0); `after` is what they receive now
  // that we've connected them. WTW's impact is after − before.
  monthlyBenefitBefore: z.number().nonnegative().default(0),
  monthlyBenefitAfter: z.number().nonnegative().default(0),

  // Links
  vsoIds: z.array(z.string()).default([]),
  assignedPhoneId: z.string().nullable().default(null),

  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Veteran = z.infer<typeof veteranSchema>;

/**
 * Enforce the "one contact channel only" rule: the preferred channel must
 * carry a value and the other must be blank. Shared by the input schema so
 * both create and edit reject a record that stores both phone and email.
 */
function refineSingleContact(
  data: { preferredContact: PreferredContact; phone?: string; email?: string },
  ctx: z.RefinementCtx,
): void {
  const phone = data.phone?.trim() ?? "";
  const email = data.email?.trim() ?? "";
  if (data.preferredContact === "phone") {
    if (!phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Add a phone number, or switch the preferred method to email.",
      });
    }
    if (email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Only the preferred contact is stored. Clear the email.",
      });
    }
  } else {
    if (!email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Add an email, or switch the preferred method to phone.",
      });
    }
    if (phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Only the preferred contact is stored. Clear the phone.",
      });
    }
  }
}

/** Fields a user supplies when creating or editing a veteran. */
export const veteranInputSchema = veteranSchema
  .omit({
    id: true,
    conciergeStatus: true,
    followUpDue: true,
    pipelineHistory: true,
    dateFound: true,
    dateConnected: true,
    dateFiled: true,
    dateWon: true,
    dateLost: true,
    createdBy: true,
    createdAt: true,
    updatedBy: true,
    updatedAt: true,
  })
  // The eligibility keys accept an explicit null here, which the four optional
  // fields on the domain schema don't. That null is how a stored answer gets
  // cleared: the edit form sends it deliberately, and dropUndefined keeps it so
  // it reaches Firestore. Intake never sends null — a blank answer there means
  // "not asked this time" and leaves the stored value alone.
  .extend({
    dischargeCharacter: dischargeCharacterSchema.nullish(),
    serviceEra: serviceEraSchema.nullish(),
    idStatus: idStatusSchema.nullish(),
    hasDependents: dependentsAnswerSchema.nullish(),
  })
  .superRefine(refineSingleContact);
export type VeteranInput = z.infer<typeof veteranInputSchema>;

/** WTW's monthly impact for a veteran: what they get now minus what they got
 *  before we connected them. Never negative. */
export function monthlyBenefitLift(
  before: number | undefined | null,
  after: number | undefined | null,
): number {
  return Math.max(0, (after ?? 0) - (before ?? 0));
}
