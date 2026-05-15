import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Phone } from "@/lib/schemas";

const COLLECTION = "phones";

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Phone {
  return {
    id,
    name: data.name ?? "",
    imeiSerial: data.imeiSerial ?? undefined,
    status: data.status ?? "available",
    assignedVeteranId: data.assignedVeteranId ?? null,
    dateAssigned:
      data.dateAssigned?.toDate?.() ?? data.dateAssigned ?? null,
    dateReturned:
      data.dateReturned?.toDate?.() ?? data.dateReturned ?? null,
    notes: data.notes ?? undefined,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt ?? new Date(),
  };
}

export async function listPhones(): Promise<Phone[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("name", "asc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function listAvailablePhones(): Promise<Phone[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("status", "in", ["available", "returned"])
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getPhone(id: string): Promise<Phone | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}
