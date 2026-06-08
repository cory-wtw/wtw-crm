import { z } from "zod";

export const ORG_CATEGORIES = [
  "foundation",
  "corporate",
  "government",
  "sponsor",
  "partner",
  "other",
] as const;
export const orgCategorySchema = z.enum(ORG_CATEGORIES);
export type OrgCategory = z.infer<typeof orgCategorySchema>;

export const ORG_CATEGORY_LABELS: Record<OrgCategory, string> = {
  foundation: "Foundation",
  corporate: "Corporate",
  government: "Government",
  sponsor: "Sponsor",
  partner: "Partner",
  other: "Other",
};

export const ORG_RELATIONSHIP_STATUSES = [
  "prospect",
  "engaged",
  "active",
  "dormant",
  "declined",
] as const;
export const orgRelationshipStatusSchema = z.enum(ORG_RELATIONSHIP_STATUSES);
export type OrgRelationshipStatus = z.infer<
  typeof orgRelationshipStatusSchema
>;

export const ORG_RELATIONSHIP_STATUS_LABELS: Record<
  OrgRelationshipStatus,
  string
> = {
  prospect: "Prospect",
  engaged: "Engaged",
  active: "Active",
  dormant: "Dormant",
  declined: "Declined",
};

export const orgContactSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});
export type OrgContact = z.infer<typeof orgContactSchema>;

export const orgSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Required"),
  category: orgCategorySchema,
  website: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactRole: z.string().optional(),
  primaryContactEmail: z.string().email().optional().or(z.literal("")),
  primaryContactPhone: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  relationshipStatus: orgRelationshipStatusSchema,
  assigneeUid: z.string().nullable().default(null),
  notes: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Org = z.infer<typeof orgSchema>;

export const orgInputSchema = orgSchema.omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
});
export type OrgInput = z.infer<typeof orgInputSchema>;
