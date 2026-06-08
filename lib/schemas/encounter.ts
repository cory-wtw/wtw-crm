import { z } from "zod";

export const TRANSACTION_TYPES = [
  "grant",
  "sponsorship",
  "donation",
  "in_kind",
  "pledge",
  "other",
] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  grant: "Grant",
  sponsorship: "Sponsorship",
  donation: "Donation",
  in_kind: "In-kind",
  pledge: "Pledge",
  other: "Other",
};

export const encounterSchema = z.object({
  id: z.string(),
  occurredAt: z.date(),
  loggedBy: z.string(),
  location: z.string().optional(),
  summary: z.string().min(1, "Required"),
  nextStep: z.string().optional(),
  nextStepDueAt: z.date().nullable().default(null),
  // Money fields — unused by veteran encounters, optional on org encounters.
  amount: z.number().nonnegative().optional(),
  transactionType: transactionTypeSchema.optional(),
  createdAt: z.date(),
});
export type Encounter = z.infer<typeof encounterSchema>;

export const encounterInputSchema = encounterSchema.omit({
  id: true,
  loggedBy: true,
  createdAt: true,
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
