import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Attachment } from "@/lib/schemas";

const COLLECTION = "attachments";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Attachment {
  return {
    id,
    veteranId: data.veteranId ?? "",
    storagePath: data.storagePath ?? "",
    downloadUrl: data.downloadUrl ?? "",
    contentType: data.contentType ?? "application/octet-stream",
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    fileName: data.fileName ?? "",
    name: data.name ?? data.fileName ?? "",
    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

/**
 * Sorted in memory rather than via .orderBy() so this doesn't need a
 * composite Firestore index — a veteran accumulates a handful of files, so
 * the sort is free. Mirrors listVerificationsForResource.
 */
export async function listAttachmentsForVeteran(
  veteranId: string,
): Promise<Attachment[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("veteranId", "==", veteranId)
    .get();
  return snap.docs
    .map((d) => deserialize(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}
