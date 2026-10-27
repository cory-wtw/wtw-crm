import { z } from "zod";

/**
 * A change Claude (via the Roster MCP server) wants made to the data. Nothing
 * in one of these touches a veteran, VSO or timeline until an admin approves
 * it on Admin → Claude changes. Claude can propose and withdraw; it can never
 * approve, and there is no delete kind at all.
 */
export const CHANGE_REQUEST_KINDS = [
  "veteran.create",
  "veteran.update",
  "vso.create",
  "vso.update",
  "encounter.create",
  "intake.record",
  "referral.create",
  "followUp.record",
  "outcome.log",
  "resource.create",
  "resource.update",
  "transaction.create",
  "transaction.update",
] as const;
export const changeRequestKindSchema = z.enum(CHANGE_REQUEST_KINDS);
export type ChangeRequestKind = z.infer<typeof changeRequestKindSchema>;

export const CHANGE_REQUEST_KIND_LABELS: Record<ChangeRequestKind, string> = {
  "veteran.create": "New veteran",
  "veteran.update": "Edit veteran",
  "vso.create": "New VSO",
  "vso.update": "Edit VSO",
  "encounter.create": "Log a contact",
  "intake.record": "Record an intake",
  "referral.create": "Send a referral",
  "followUp.record": "Record a follow-up",
  "outcome.log": "Log a win",
  "resource.create": "New resource",
  "resource.update": "Edit resource",
  "transaction.create": "New transaction",
  "transaction.update": "Edit transaction",
};

/** Kinds that touch the books. Admin-only to read, like /finances. */
export function isFinanceKind(kind: ChangeRequestKind): boolean {
  return kind.startsWith("transaction.");
}

/**
 * `applying` is the moment between an admin tapping Approve and the write
 * landing; a request is claimed there so a double tap can't apply it twice.
 *
 * `stale` means the record changed after Claude looked at it, so the "before"
 * values on the request no longer describe what's stored. It's never applied:
 * Claude has to look again and propose again.
 */
export const CHANGE_REQUEST_STATUSES = [
  "pending",
  "applying",
  "approved",
  "rejected",
  "withdrawn",
  "stale",
] as const;
export const changeRequestStatusSchema = z.enum(CHANGE_REQUEST_STATUSES);
export type ChangeRequestStatus = z.infer<typeof changeRequestStatusSchema>;

export const CHANGE_REQUEST_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  pending: "Waiting for approval",
  applying: "Saving",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  stale: "Out of date",
};

/** A pending request older than this can't be approved — it's re-proposed. */
export const CHANGE_REQUEST_EXPIRY_DAYS = 7;

/** Field → before/after. JSON-safe values only: dates travel as ISO strings. */
export type FieldChanges = Record<string, { before: unknown; after: unknown }>;

export const changeRequestSchema = z.object({
  id: z.string(),
  kind: changeRequestKindSchema,
  status: changeRequestStatusSchema,
  /** The record being edited, or the veteran a contact is logged on. Null
   *  for a create until it's approved. */
  targetId: z.string().nullable(),
  /** "Maria G." / "Jane Smith (DAV)" — so the queue reads without lookups. */
  targetLabel: z.string(),
  changes: z.record(z.string(), z.object({ before: z.unknown(), after: z.unknown() })),
  /** What the approval runs, for kinds that aren't a plain field write —
   *  an intake, a referral, a follow-up, a win, a full resource or
   *  transaction input. Null for the field-diff kinds. */
  payload: z.record(z.string(), z.unknown()).nullable().default(null),
  /** Why Claude wants it. Required: an unexplained change isn't reviewable. */
  reason: z.string().min(1),
  /** Requests from one phone call share a label, so they can be read — and
   *  approved — together, in the order they were proposed. */
  groupLabel: z.string().nullable().default(null),
  proposedBy: z.string(),
  /** The admin whose Claude connector proposed it. */
  proposedByEmail: z.string().nullable().default(null),
  proposedAt: z.date(),
  reviewedBy: z.string().nullable().default(null),
  reviewedByEmail: z.string().nullable().default(null),
  reviewedAt: z.date().nullable().default(null),
  reviewNote: z.string().nullable().default(null),
  /** The id a create was written under, once approved. */
  appliedId: z.string().nullable().default(null),
  /** What approving produced that the reviewer needs next — the referral
   *  packet text to send. */
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  /** Why the last approve attempt didn't save. The request stays pending. */
  lastError: z.string().nullable().default(null),
});
export type ChangeRequest = z.infer<typeof changeRequestSchema>;

export function isExpired(proposedAt: Date, now: Date = new Date()): boolean {
  return (
    now.getTime() - proposedAt.getTime() >
    CHANGE_REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
}

/**
 * A veteranId that names a veteran Claude has proposed but nobody has approved
 * yet: "pending:<change request id>". Lets one call log a new veteran and their
 * intake, referral and notes together; approving in order resolves it.
 */
export const PENDING_PREFIX = "pending:";

export function pendingRequestId(veteranId: string): string | null {
  return veteranId.startsWith(PENDING_PREFIX) ? veteranId.slice(PENDING_PREFIX.length) : null;
}
