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

/**
 * Push the intake's basics back to the veteran record so the canonical row
 * stays current. Skips empty values (we don't overwrite a real phone with
 * blank) and only writes fields that actually changed. Audit-logged with
 * a precise before/after diff.
 */
async function syncVeteranFromIntakeBasics(
  veteranId: string,
  basics:
    | {
        fullName?: string;
        bestPhone?: string;
        dateOfBirth?: string;
      }
    | undefined,
  sessionUid: string,
): Promise<void> {
  if (!basics) return;

  const docRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await docRef.get();
  if (!snap.exists) return;
  const existing = snap.data() as Record<string, unknown>;

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const updates: Record<string, unknown> = {};

  const newName = basics.fullName?.trim();
  if (newName && newName !== existing.name) {
    diff.name = { before: existing.name ?? null, after: newName };
    updates.name = newName;
  }

  const newPhone = basics.bestPhone?.trim();
  if (newPhone && newPhone !== existing.phone) {
    diff.phone = { before: existing.phone ?? null, after: newPhone };
    updates.phone = newPhone;
  }

  if (basics.dateOfBirth) {
    const parsed = new Date(basics.dateOfBirth);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      if (Number.isFinite(year) && year !== existing.birthYear) {
        diff.birthYear = {
          before: existing.birthYear ?? null,
          after: year,
        };
        updates.birthYear = year;
      }
    }
  }

  if (Object.keys(updates).length === 0) return;

  await docRef.update({
    ...updates,
    updatedBy: sessionUid,
    updatedAt: new Date(),
  });

  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff,
  });
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

  try {
    await syncVeteranFromIntakeBasics(
      veteranId,
      parsed.data.basics,
      session.uid,
    );
  } catch (err) {
    console.error("syncVeteranFromIntakeBasics failed", err);
  }

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

  try {
    await syncVeteranFromIntakeBasics(
      veteranId,
      parsed.data.basics,
      session.uid,
    );
  } catch (err) {
    console.error("syncVeteranFromIntakeBasics failed", err);
  }

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
