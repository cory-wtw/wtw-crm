import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { type Invite, normalizeEmail } from "@/lib/schemas";

const COLLECTION = "invites";

function deserialize(
  email: string,
  data: FirebaseFirestore.DocumentData,
): Invite {
  return {
    email: data.email ?? email,
    role: data.role ?? "standard",
    invitedBy: data.invitedBy ?? "",
    invitedAt:
      data.invitedAt instanceof Timestamp
        ? data.invitedAt.toDate()
        : (data.invitedAt ?? new Date()),
  };
}

export async function listInvites(): Promise<Invite[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("invitedAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getInvite(email: string): Promise<Invite | null> {
  const doc = await adminDb
    .collection(COLLECTION)
    .doc(normalizeEmail(email))
    .get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}

export async function deleteInvite(email: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(normalizeEmail(email)).delete();
}
