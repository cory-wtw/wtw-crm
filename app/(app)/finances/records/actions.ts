"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { RECORDS, getRecord } from "@/lib/db/finance";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";
import { RECORD_MAX_BYTES, recordInputSchema } from "@/lib/schemas";

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * Record a file the browser already uploaded to Storage. The bytes never
 * pass through the server; we check the object really exists in the
 * uploader's own folder and take its size and type from Storage rather than
 * trusting the client.
 */
export async function createRecordAction(raw: unknown): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageFinances(session))
    return { ok: false, error: "Only admins can manage finances." };

  const parsed = recordInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const input = parsed.data;
  if (!input.storagePath.startsWith(`finance-records/${session.uid}/`)) {
    return { ok: false, error: "That upload isn't in your folder." };
  }

  const file = mediaBucket().file(input.storagePath);
  const [exists] = await file.exists();
  if (!exists) return { ok: false, error: "The upload didn't finish. Try again." };
  const [meta] = await file.getMetadata();
  const sizeBytes = Number(meta.size ?? 0);
  if (sizeBytes > RECORD_MAX_BYTES) {
    await file.delete({ ignoreNotFound: true });
    return { ok: false, error: "That file is larger than the 25 MB limit." };
  }

  const { notes, ...rest } = input;
  const ref = await adminDb.collection(RECORDS).add({
    ...rest,
    // Firestore rejects undefined fields; leave notes off entirely when blank.
    ...(notes ? { notes } : {}),
    contentType: meta.contentType ?? "application/octet-stream",
    sizeBytes,
    createdBy: session.uid,
    createdAt: new Date(),
  });
  await logAudit({
    action: "create",
    resourceType: "financeRecord",
    resourceId: ref.id,
    diff: { label: { before: null, after: input.label } },
  });
  revalidatePath("/finances/records");
  return { ok: true, id: ref.id };
}

export async function deleteRecordAction(id: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageFinances(session))
    return { ok: false, error: "Only admins can manage finances." };

  const record = await getRecord(id);
  if (!record) return { ok: false, error: "Record not found." };
  await mediaBucket().file(record.storagePath).delete({ ignoreNotFound: true });
  await adminDb.collection(RECORDS).doc(id).delete();
  await logAudit({
    action: "delete",
    resourceType: "financeRecord",
    resourceId: id,
    diff: { label: { before: record.label, after: null } },
  });
  revalidatePath("/finances/records");
  return { ok: true, id };
}
