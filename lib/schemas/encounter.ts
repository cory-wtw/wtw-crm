import { z } from "zod";

export const encounterSchema = z.object({
  id: z.string(),
  occurredAt: z.date(),
  loggedBy: z.string(),
  location: z.string().optional(),
  summary: z.string().min(1, "Required"),
  nextStep: z.string().optional(),
  nextStepDueAt: z.date().nullable().default(null),
  createdAt: z.date(),
});
export type Encounter = z.infer<typeof encounterSchema>;

export const encounterInputSchema = encounterSchema.omit({
  id: true,
  loggedBy: true,
  createdAt: true,
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
