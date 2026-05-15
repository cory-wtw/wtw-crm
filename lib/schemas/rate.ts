import { z } from "zod";

export const DEPENDENT_STATUSES = [
  "alone",
  "with_spouse",
  "with_spouse_kids",
] as const;
export const dependentStatusSchema = z.enum(DEPENDENT_STATUSES);
export type DependentStatus = z.infer<typeof dependentStatusSchema>;

export const DEPENDENT_STATUS_LABELS: Record<DependentStatus, string> = {
  alone: "Alone",
  with_spouse: "With Spouse",
  with_spouse_kids: "With Spouse + Kids",
};

/**
 * A row from the VA disability rate table. Document ID is the rate code
 * (e.g. "100-SMCS-SK"). One row per rate-code × rate-year combination.
 */
export const rateSchema = z.object({
  rateCode: z.string(),
  rating: z.string(),
  dependentStatus: dependentStatusSchema,
  monthlyAmount: z.number().nonnegative(),
  rateYear: z.number().int(),
});
export type Rate = z.infer<typeof rateSchema>;
