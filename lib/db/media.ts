import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Media } from "@/lib/schemas";

const COLLECTION = "media";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Media {
  return {
    id,
    kind: data.kind ?? "image",
    storagePath: data.storagePath ?? "",
    downloadUrl: data.downloadUrl ?? "",
    contentType: data.contentType ?? "application/octet-stream",
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    fileName: data.fileName ?? "",
    caption: data.caption ?? "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    linkedVeteranId: data.linkedVeteranId ?? null,
    consentOnFile: data.consentOnFile ?? false,
    status: data.status ?? "new",
    usedAt: tsToDate(data.usedAt),
    usedBy: data.usedBy ?? null,
    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

export async function listMedia(): Promise<Media[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getMedia(id: string): Promise<Media | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}
