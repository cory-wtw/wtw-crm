import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { AuditDiff, AuditLog } from "@/lib/schemas";

const COLLECTION = "auditLog";

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): AuditLog {
  return {
    id,
    actorUid: data.actorUid ?? "",
    actorEmail: data.actorEmail ?? "",
    action: data.action ?? "read",
    resourceType: data.resourceType ?? "veteran",
    resourceId: data.resourceId ?? "",
    at: tsToDate(data.at),
    diff: data.diff as AuditDiff | undefined,
  };
}

export async function listRecentAuditLogs(
  limit = 200,
): Promise<AuditLog[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}
