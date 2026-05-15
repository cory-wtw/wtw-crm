import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { User } from "@/lib/schemas";

const COLLECTION = "users";

function deserialize(
  uid: string,
  data: FirebaseFirestore.DocumentData,
): User {
  return {
    uid,
    email: data.email ?? "",
    displayName: data.displayName ?? null,
    role: data.role ?? "standard",
    active: data.active ?? false,
    createdAt:
      data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
    lastLoginAt:
      data.lastLoginAt?.toDate?.() ?? data.lastLoginAt ?? null,
  };
}

export async function listUsers(): Promise<User[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("active", "==", true)
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function listAllUsers(): Promise<User[]> {
  const snap = await adminDb.collection(COLLECTION).get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getUser(uid: string): Promise<User | null> {
  const doc = await adminDb.collection(COLLECTION).doc(uid).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}
