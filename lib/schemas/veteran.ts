import { z } from "zod";
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

  // Benefit projection.
  // `lifeExpectancyAtFound` is the expected REMAINING years at the moment
  // we found them (not absolute life expectancy). Lifetime benefit =
  // monthlyAmount × 12 × lifeExpectancyAtFound.
  lifeExpectancyAtFound: z.number().positive().optional(),
  ageAtFound: z.number().int().nonnegative().optional(),

  // Rate codes look up the monthly amount in rateTable.
  anticipatedRateCode: z.string().nullable().default(null),
  actualRateCode: z.string().nullable().default(null),

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
    pipelineHistory: true,
    dateFound: true,
    dateConnected: true,
    dateFiled: true,
    dateWon: true,
    dateLost: true,
    ageAtFound: true,
    createdBy: true,
    createdAt: true,
    updatedBy: true,
    updatedAt: true,
  })
  .superRefine(refineSingleContact);
export type VeteranInput = z.infer<typeof veteranInputSchema>;

/**
 * Lifetime benefit = monthlyAmount × 12 × lifeExpectancyAtFound, where
 * lifeExpectancyAtFound is the expected remaining years at Found. Returns
 * 0 when either input is missing.
 */
export function lifetimeBenefit(
  monthlyAmount: number | undefined | null,
  lifeExpectancyAtFound: number | undefined | null,
): number {
  if (!monthlyAmount || !lifeExpectancyAtFound) return 0;
  return monthlyAmount * 12 * lifeExpectancyAtFound;
}
