import { z } from "zod";

export const AUDIT_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "export",
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  read: "Read",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  export: "Exported",
};

export const RESOURCE_TYPES = [
  "veteran",
  "vso",
  "encounter",
  "phone",
  "user",
  "invite",
  "org",
  "org_encounter",
  "intake",
] as const;
export const resourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof resourceTypeSchema>;

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  veteran: "Veteran",
  vso: "VSO",
  encounter: "Encounter",
  phone: "Phone",
  user: "User",
  invite: "Invite",
  org: "Organization",
  org_encounter: "Org Encounter",
  intake: "Intake",
};

export const auditDiffEntrySchema = z.object({
  before: z.unknown(),
  after: z.unknown(),
});
export type AuditDiffEntry = z.infer<typeof auditDiffEntrySchema>;

export type AuditDiff = Record<string, AuditDiffEntry>;

export const auditLogSchema = z.object({
  id: z.string(),
  actorUid: z.string(),
  actorEmail: z.string(),
  action: auditActionSchema,
  resourceType: resourceTypeSchema,
  resourceId: z.string(),
  at: z.date(),
  diff: z.record(z.string(), auditDiffEntrySchema).optional(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
