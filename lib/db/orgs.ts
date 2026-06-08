import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import type { Org } from "@/lib/schemas";

const COLLECTION = "orgs";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Org {
  return {
    id,
    name: data.name ?? "",
    category: data.category ?? "other",
    website: data.website ?? undefined,
    primaryContactName: data.primaryContactName ?? undefined,
    primaryContactRole: data.primaryContactRole ?? undefined,
    primaryContactEmail: data.primaryContactEmail ?? undefined,
    primaryContactPhone: data.primaryContactPhone ?? undefined,
    city: data.city ?? undefined,
    state: data.state ?? undefined,
    relationshipStatus: data.relationshipStatus ?? "prospect",
    assigneeUid: data.assigneeUid ?? null,
    notes: data.notes ?? undefined,
    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

export async function listOrgs(): Promise<Org[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getOrg(id: string): Promise<Org | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  await logAudit({
    action: "read",
    resourceType: "org" as const,
    resourceId: id,
  });
  return deserialize(doc.id, doc.data()!);
}
