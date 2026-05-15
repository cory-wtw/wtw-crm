import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import type { AuditAction, AuditDiff, ResourceType } from "@/lib/schemas";

export type AuditEntry = {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string;
  diff?: AuditDiff;
};

/**
 * Append an entry to the auditLog collection. Failures are logged but
 * not re-thrown — we never want audit failures to undo the primary
 * action they're tracking. Actor info comes from the current session;
 * when there's no session (scripts / system jobs) the entry is tagged
 * "system" so it's still searchable.
 */
export async function logAudit(input: AuditEntry): Promise<void> {
  try {
    const session = await getSession();
    const actorUid = session?.uid ?? "system";
    const actorEmail = session?.email ?? "system";
    const doc: Record<string, unknown> = {
      actorUid,
      actorEmail,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      at: new Date(),
    };
    if (input.diff && Object.keys(input.diff).length > 0) {
      doc.diff = input.diff;
    }
    await adminDb.collection("auditLog").add(doc);
  } catch (err) {
    console.error("logAudit failed", err);
  }
}
