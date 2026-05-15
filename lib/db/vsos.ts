import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Vso } from "@/lib/schemas";

const COLLECTION = "vsos";

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Vso {
  return {
    id,
    fullName: data.fullName ?? "",
    affiliation: data.affiliation ?? undefined,
    city: data.city ?? undefined,
    state: data.state ?? undefined,
    directPhone: data.directPhone ?? undefined,
    directEmail: data.directEmail ?? undefined,
    preferredContactMethod: data.preferredContactMethod ?? undefined,
    partnershipStatus: data.partnershipStatus ?? "in_discussion",
    notes: data.notes ?? undefined,
    referralsMade: data.referralsMade ?? 0,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt ?? new Date(),
  };
}

export async function listVsos(): Promise<Vso[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("fullName", "asc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getVso(id: string): Promise<Vso | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}

export async function getVsosByIds(ids: string[]): Promise<Vso[]> {
  if (ids.length === 0) return [];
  const docs = await Promise.all(
    ids.map((id) => adminDb.collection(COLLECTION).doc(id).get()),
  );
  return docs
    .filter((d) => d.exists)
    .map((d) => deserialize(d.id, d.data()!));
}
