import { z } from "zod";

export const PARTNERSHIP_STATUSES = [
  "active_partner",
  "in_discussion",
  "inactive",
  "declined",
] as const;
export const partnershipStatusSchema = z.enum(PARTNERSHIP_STATUSES);
export type PartnershipStatus = z.infer<typeof partnershipStatusSchema>;

export const PARTNERSHIP_STATUS_LABELS: Record<PartnershipStatus, string> = {
  active_partner: "Active Partner",
  in_discussion: "In Discussion",
  inactive: "Inactive",
  declined: "Declined",
};

export const CONTACT_METHODS = ["phone", "email", "text", "in_person"] as const;
export const contactMethodSchema = z.enum(CONTACT_METHODS);

export const vsoSchema = z.object({
  id: z.string(),
  fullName: z.string().min(1, "Required"),
  affiliation: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  directPhone: z.string().optional(),
  directEmail: z.string().email().optional().or(z.literal("")),
  preferredContactMethod: contactMethodSchema.optional(),
  partnershipStatus: partnershipStatusSchema.default("in_discussion"),
  notes: z.string().optional(),
  referralsMade: z.number().int().nonnegative().default(0),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Vso = z.infer<typeof vsoSchema>;

export const vsoInputSchema = vsoSchema.omit({
  id: true,
  referralsMade: true,
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
});
export type VsoInput = z.infer<typeof vsoInputSchema>;
