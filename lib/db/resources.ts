import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Resource } from "@/lib/schemas";

const COLLECTION = "resources";

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Resource {
  return {
    id,
    organizationName: data.organizationName ?? "",
    website: data.website ?? undefined,
    contactName: data.contactName ?? undefined,
    contactPhone: data.contactPhone ?? undefined,
    contactEmail: data.contactEmail ?? undefined,
    description: data.description ?? undefined,
    eligibility: data.eligibility ?? undefined,
    services: data.services ?? undefined,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt ?? new Date(),
  };
}

export async function listResources(): Promise<Resource[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("organizationName", "asc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getResource(id: string): Promise<Resource | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}
