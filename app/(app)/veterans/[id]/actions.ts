"use server";

import { revalidatePath } from "next/cache";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getAttachment } from "@/lib/db/attachments";
import { getSession } from "@/lib/firebase/session";
import {
  createReferral,
  matchIntake,
  recordIntake,
  type IntakeResult,
  type ReferralResult,
} from "@/lib/ops/concierge";
import {
  canAccessCrm,
  canCreateReferral,
  canEditVeteran,
  canRunIntake,
} from "@/lib/permissions";
import {
  attachmentInputSchema,
  attachmentRenameInputSchema,
} from "@/lib/schemas";

export type {
  Candidate,
  ExcludedResource,
  IntakeInput,
  IntakeResult,
  ReferralResult,
} from "@/lib/ops/concierge";

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map(
      (i) =>
        `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`,
    )
    .join("; ");
}

/**
 * Run a concierge intake: save the eligibility keys and the assessment, then
 * hand back a short list. The work is in lib/ops/concierge.ts.
 */
export async function runIntakeAction(
  veteranId: string,
  rawInput: unknown,
): Promise<
  { ok: true; result: IntakeResult } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false, error: "Your account doesn't have access to this." };
  }

  const snap = await adminDb.collection("veterans").doc(veteranId).get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  const existing = snap.data()!;
  if (!canRunIntake(session, { assigneeUid: existing.assigneeUid ?? null })) {
    return {
      ok: false,
      error: "Your account can't run intake.",
    };
  }

  const matched = await matchIntake(existing, rawInput);
  if (!matched.ok) return matched;
  const recorded = await recordIntake(session, veteranId, matched.record);
  if (!recorded.ok) return recorded;
  return { ok: true, result: matched.result };
}

/** Approve a referral packet. The work is in lib/ops/concierge.ts. */
export async function createReferralAction(
  veteranId: string,
  rawInput: unknown,
): Promise<
  { ok: true; result: ReferralResult } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false, error: "Your account doesn't have access to this." };
  }

  const snap = await adminDb.collection("veterans").doc(veteranId).get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  if (
    !canCreateReferral(session, { assigneeUid: snap.data()!.assigneeUid ?? null })
  ) {
    return {
      ok: false,
      error: "Your account can't send referrals.",
    };
  }

  const result = await createReferral(session, veteranId, rawInput);
  if (result.ok) {
    revalidatePath(`/veterans/${veteranId}`);
    revalidatePath("/veterans");
  }
  return result;
}

async function requireVeteranEditAccess(
  veteranId: string,
): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const snap = await adminDb.collection("veterans").doc(veteranId).get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };

  if (
    !canEditVeteran(session, { assigneeUid: snap.data()?.assigneeUid ?? null })
  ) {
    return {
      ok: false,
      error: "Your account can't manage files.",
    };
  }
  return { ok: true, session };
}

/**
 * Record a file the client already uploaded to Firebase Storage. Mirrors
 * createMediaAction: the bytes never pass through the server, the browser
 * uploads directly to Storage and hands us back the path + URL.
 */
export async function createAttachmentAction(
  veteranId: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const access = await requireVeteranEditAccess(veteranId);
  if (!access.ok) return access;

  const parsed = attachmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;
  if (input.veteranId !== veteranId) {
    return { ok: false, error: "Veteran mismatch." };
  }

  const now = new Date();
  const ref = await adminDb.collection("attachments").add({
    ...input,
    createdBy: access.session.uid,
    createdAt: now,
    updatedBy: access.session.uid,
    updatedAt: now,
  });

  await logAudit({
    action: "create",
    resourceType: "attachment",
    resourceId: ref.id,
    diff: { name: { before: null, after: input.name } },
  });

  revalidatePath(`/veterans/${veteranId}`);
  return { ok: true, id: ref.id };
}

/** Rename an attachment. The file itself is immutable. */
export async function renameAttachmentAction(
  veteranId: string,
  attachmentId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requireVeteranEditAccess(veteranId);
  if (!access.ok) return access;

  const attachment = await getAttachment(attachmentId);
  if (!attachment || attachment.veteranId !== veteranId) {
    return { ok: false, error: "Attachment not found." };
  }

  const parsed = attachmentRenameInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  const now = new Date();
  await adminDb.collection("attachments").doc(attachmentId).update({
    name: parsed.data.name,
    updatedBy: access.session.uid,
    updatedAt: now,
  });

  await logAudit({
    action: "update",
    resourceType: "attachment",
    resourceId: attachmentId,
    diff: computeDiff(
      { name: attachment.name },
      { name: parsed.data.name },
      ["name"],
    ),
  });

  revalidatePath(`/veterans/${veteranId}`);
  return { ok: true };
}

/** Delete an attachment: removes the Storage file first, then the doc. */
export async function deleteAttachmentAction(
  veteranId: string,
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requireVeteranEditAccess(veteranId);
  if (!access.ok) return access;

  const attachment = await getAttachment(attachmentId);
  if (!attachment || attachment.veteranId !== veteranId) {
    return { ok: false, error: "Attachment not found." };
  }

  // Best-effort Storage cleanup — a missing object shouldn't block removing
  // the record.
  try {
    await mediaBucket()
      .file(attachment.storagePath)
      .delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("attachment storage delete failed", err);
  }

  await adminDb.collection("attachments").doc(attachmentId).delete();
  await logAudit({
    action: "delete",
    resourceType: "attachment",
    resourceId: attachmentId,
  });

  revalidatePath(`/veterans/${veteranId}`);
  return { ok: true };
}
