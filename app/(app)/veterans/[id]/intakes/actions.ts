"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/firebase/session";
import { intakeInputSchema } from "@/lib/schemas";

function dropUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      (out as Record<string, unknown>)[k] = dropUndefined(
        v as Record<string, unknown>,
      );
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

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

export async function createIntakeAction(
  veteranId: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = intakeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  const now = new Date();
  const doc = dropUndefined({
    ...parsed.data,
    liaisonUid: session.uid,
    status: "draft",
    completedAt: null,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb
    .collection("veterans")
    .doc(veteranId)
    .collection("intakes")
    .add(doc);

  await logAudit({
    action: "create",
    resourceType: "intake",
    resourceId: `${veteranId}/${ref.id}`,
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath(`/veterans/${veteranId}/intakes/${ref.id}`);
  return { ok: true, id: ref.id };
}

export async function saveIntakeDraftAction(
  veteranId: string,
  intakeId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = intakeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  const ref = adminDb
    .collection("veterans")
    .doc(veteranId)
    .collection("intakes")
    .doc(intakeId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Intake not found." };

  const now = new Date();
  const updates = dropUndefined({
    ...parsed.data,
    updatedBy: session.uid,
    updatedAt: now,
  });

  await ref.update(updates);

  await logAudit({
    action: "update",
    resourceType: "intake",
    resourceId: `${veteranId}/${intakeId}`,
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath(`/veterans/${veteranId}/intakes/${intakeId}`);
  return { ok: true };
}

export async function markIntakeCompleteAction(
  veteranId: string,
  intakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const ref = adminDb
    .collection("veterans")
    .doc(veteranId)
    .collection("intakes")
    .doc(intakeId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Intake not found." };

  const now = new Date();
  await ref.update({
    status: "complete",
    completedAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  await logAudit({
    action: "update",
    resourceType: "intake",
    resourceId: `${veteranId}/${intakeId}`,
    diff: { status: { before: "draft", after: "complete" } },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath(`/veterans/${veteranId}/intakes/${intakeId}`);
  return { ok: true };
}

export async function reopenIntakeAction(
  veteranId: string,
  intakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const ref = adminDb
    .collection("veterans")
    .doc(veteranId)
    .collection("intakes")
    .doc(intakeId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Intake not found." };

  const now = new Date();
  await ref.update({
    status: "draft",
    completedAt: null,
    updatedBy: session.uid,
    updatedAt: now,
  });

  await logAudit({
    action: "update",
    resourceType: "intake",
    resourceId: `${veteranId}/${intakeId}`,
    diff: { status: { before: "complete", after: "draft" } },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath(`/veterans/${veteranId}/intakes/${intakeId}`);
  return { ok: true };
}
