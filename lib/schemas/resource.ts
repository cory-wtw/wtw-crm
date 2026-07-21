import { z } from "zod";

// A Community Resource is an outside organization we can point veterans to —
// food banks, rent-assistance funds, housing programs, etc. It's a searchable
// directory keyed on what the org actually does, so staff can look up a need
// ("rent assistance") and surface the orgs that offer it.
export const resourceSchema = z.object({
  id: z.string(),
  organizationName: z.string().min(1, "Required"),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  services: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Resource = z.infer<typeof resourceSchema>;

export const resourceInputSchema = resourceSchema.omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
});
export type ResourceInput = z.infer<typeof resourceInputSchema>;
