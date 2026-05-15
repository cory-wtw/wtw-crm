import { z } from "zod";
import { dependentStatusSchema } from "./rate";
import {
  pipelineHistoryEntrySchema,
  pipelineStageSchema,
} from "./pipeline";

export const BRANCHES = [
  "army",
  "navy",
  "marines",
  "air_force",
  "space_force",
  "coast_guard",
] as const;
export const branchSchema = z.enum(BRANCHES);
export type Branch = z.infer<typeof branchSchema>;
export const BRANCH_LABELS: Record<Branch, string> = {
  army: "Army",
  navy: "Navy",
  marines: "Marines",
  air_force: "Air Force",
  space_force: "Space Force",
  coast_guard: "Coast Guard",
};

export const DISCHARGE_STATUSES = [
  "honorable",
  "general",
  "oth",
  "bcd",
  "dd",
  "unknown",
] as const;
export const dischargeStatusSchema = z.enum(DISCHARGE_STATUSES);
export type DischargeStatus = z.infer<typeof dischargeStatusSchema>;
export const DISCHARGE_STATUS_LABELS: Record<DischargeStatus, string> = {
  honorable: "Honorable",
  general: "General",
  oth: "Other Than Honorable",
  bcd: "Bad Conduct Discharge",
  dd: "Dishonorable Discharge",
  unknown: "Unknown",
};

export const HOUSING_STATUSES = [
  "unsheltered",
  "transitional",
  "housed",
  "unknown",
] as const;
export const housingStatusSchema = z.enum(HOUSING_STATUSES);
export type HousingStatus = z.infer<typeof housingStatusSchema>;
export const HOUSING_STATUS_LABELS: Record<HousingStatus, string> = {
  unsheltered: "Unsheltered",
  transitional: "Transitional",
  housed: "Housed",
  unknown: "Unknown",
};

const currentYear = new Date().getFullYear();

export const veteranSchema = z.object({
  id: z.string(),

  // Identity
  name: z.string().min(1, "Required"),
  preferredName: z.string().optional(),
  phone: z.string().optional(),

  // Demographics
  birthYear: z
    .number()
    .int()
    .min(1900, "Too far back")
    .max(currentYear, "Future year")
    .optional(),
  yearlyIncome: z.number().nonnegative().optional(),
  householdSize: z.number().int().nonnegative().optional(),
  dependentStatus: dependentStatusSchema.optional(),

  // Service info (optional, per AirTable)
  branch: branchSchema.optional(),
  dischargeStatus: dischargeStatusSchema.optional(),
  serviceFrom: z.string().optional(),
  serviceTo: z.string().optional(),
  housingStatus: housingStatusSchema.optional(),

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

  // Win math.
  // `lifeExpectancyAtFound` is the expected REMAINING years at the moment
  // we found them (not absolute life expectancy). Lifetime benefit =
  // monthlyAmount × 12 × lifeExpectancyAtFound.
  lifeExpectancyAtFound: z.number().positive().optional(),
  ageAtFound: z.number().int().nonnegative().optional(),

  // Benefit projections (rate codes look up monthly amount in rateTable)
  anticipatedRateCode: z.string().nullable().default(null),
  actualRateCode: z.string().nullable().default(null),

  // Links
  vsoIds: z.array(z.string()).default([]),
  assignedPhoneId: z.string().nullable().default(null),

  notes: z.string().optional(),

  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Veteran = z.infer<typeof veteranSchema>;

/** Fields a user supplies when creating a veteran. */
export const veteranInputSchema = veteranSchema.omit({
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
});
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
