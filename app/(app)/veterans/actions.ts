"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getSession } from "@/lib/firebase/session";
import {
  canAccessCrm,
  canEditVeteran,
  canReassignVeteran,
  isAdmin,
} from "@/lib/permissions";
import {
  encounterInputSchema,
  type PipelineHistoryEntry,
  type PipelineStage,
  pipelineStageSchema,
  veteranInputSchema,
} from "@/lib/schemas";
import { attachmentPathPrefix, isUploadPathUnder } from "@/lib/storage-paths";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function dropUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function dateFieldForStage(stage: PipelineStage):
  | "dateFound"
  | "dateConnected"
  | "dateFiled"
  | "dateWon"
  | "dateLost" {
  switch (stage) {
    case "found":
      return "dateFound";
    case "connected":
      return "dateConnected";
    case "filed":
      return "dateFiled";
    case "won":
      return "dateWon";
    case "lost":
      return "dateLost";
  }
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

export async function createVeteranAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = veteranInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const stage = input.pipelineStage ?? "found";

  // Standard users can't choose the assignee — they always self-assign.
  const assigneeUid = canReassignVeteran(session)
    ? (input.assigneeUid ?? null)
    : session.uid;

  const historyEntry: PipelineHistoryEntry = {
    stage,
    enteredAt: now,
    byUid: session.uid,
  };

  const doc = dropUndefined({
    ...input,
    pipelineStage: stage,
    pipelineHistory: [historyEntry],
    dateFound: stage === "found" ? now : null,
    dateConnected: null,
    dateFiled: null,
    dateWon: null,
    dateLost: null,
    vsoIds: input.vsoIds ?? [],
    assigneeUid,
    // Adding the record is itself the first contact — the check-in queue
    // shouldn't come knocking the moment a veteran is found.
    lastContactedAt: now,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("veterans").add(doc);
  await logAudit({
    action: "create",
    resourceType: "veteran",
    resourceId: ref.id,
  });

  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true, id: ref.id };
}

export async function editVeteranAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = veteranInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const docRef = adminDb.collection("veterans").doc(id);
  const existingSnap = await docRef.get();
  if (!existingSnap.exists) {
    return { ok: false, error: "Veteran not found." };
  }
  const existing = existingSnap.data()!;

  if (
    !canEditVeteran(session, {
      assigneeUid: existing.assigneeUid ?? null,
    })
  ) {
    return {
      ok: false,
      error: "You can only edit veterans assigned to you.",
    };
  }

  // Standard users can't change the assignee. Force it back to whatever
  // the doc already had so a hand-edited request can't slip through.
  if (
    !canReassignVeteran(session) &&
    input.assigneeUid !== existing.assigneeUid
  ) {
    input.assigneeUid = existing.assigneeUid ?? null;
  }

  const now = new Date();
  const stageChanged = input.pipelineStage !== existing.pipelineStage;

  const stageUpdates: Record<string, unknown> = {};

  if (stageChanged) {
    const newEntry: PipelineHistoryEntry = {
      stage: input.pipelineStage,
      enteredAt: now,
      byUid: session.uid,
    };
    // arrayUnion, not read-modify-write: a concurrent stage change must not
    // be erased by this one.
    stageUpdates.pipelineHistory = FieldValue.arrayUnion(newEntry);
    stageUpdates[dateFieldForStage(input.pipelineStage)] = now;
  }

  const updates = dropUndefined({
    ...input,
    ...stageUpdates,
    vsoIds: input.vsoIds ?? [],
    assigneeUid: input.assigneeUid ?? null,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const diff = computeDiff(
    existing as Record<string, unknown>,
    input as unknown as Record<string, unknown>,
    Object.keys(input),
  );

  await docRef.update(updates);
  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: id,
    diff,
  });

  revalidatePath(`/veterans/${id}`);
  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true, id };
}

export async function changeStageAction(
  veteranId: string,
  newStageRaw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const stageParse = pipelineStageSchema.safeParse(newStageRaw);
  if (!stageParse.success) {
    return { ok: false, error: "Unknown pipeline stage." };
  }
  const newStage = stageParse.data;

  const docRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { ok: false, error: "Veteran not found." };
  }
  const existing = snap.data()!;

  if (
    !canEditVeteran(session, {
      assigneeUid: existing.assigneeUid ?? null,
    })
  ) {
    return {
      ok: false,
      error: "You can only change the stage on veterans assigned to you.",
    };
  }

  if (existing.pipelineStage === newStage) {
    return { ok: false, error: "Already at that stage." };
  }

  const now = new Date();
  const newEntry: PipelineHistoryEntry = {
    stage: newStage,
    enteredAt: now,
    byUid: session.uid,
  };

  await docRef.update({
    pipelineStage: newStage,
    pipelineHistory: FieldValue.arrayUnion(newEntry),
    [dateFieldForStage(newStage)]: now,
    updatedBy: session.uid,
    updatedAt: now,
  });
  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: {
      pipelineStage: {
        before: existing.pipelineStage ?? null,
        after: newStage,
      },
    },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true };
}

export async function addEncounterAction(
  veteranId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = encounterInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const data = dropUndefined({
    ...input,
    nextStepDueAt: input.nextStepDueAt ?? null,
    loggedBy: session.uid,
    createdAt: now,
  });

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  const veteranSnap = await veteranRef.get();
  if (!veteranSnap.exists) return { ok: false, error: "Veteran not found." };
  const existingLastContacted = tsToDate(veteranSnap.data()!.lastContactedAt);

  const encounterRef = await veteranRef.collection("encounters").add(data);

  // Touch the veteran's updatedAt so the list view bumps it to the top, and
  // move lastContactedAt forward — but never backward: a note backfilled
  // about an older contact must not erase a more recent one just logged.
  await veteranRef.update({
    lastContactedAt:
      existingLastContacted && existingLastContacted > input.occurredAt
        ? existingLastContacted
        : input.occurredAt,
    updatedAt: now,
    updatedBy: session.uid,
  });

  await logAudit({
    action: "create",
    resourceType: "encounter",
    resourceId: `${veteranId}/${encounterRef.id}`,
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true };
}

export async function redirectToVeteran(id: string): Promise<void> {
  redirect(`/veterans/${id}`);
}

export async function deleteVeteranAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };
  if (!isAdmin(session)) {
    return { ok: false, error: "Only admins can delete veterans." };
  }

  const docRef = adminDb.collection("veterans").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };

  // Files first: these are DD-214s and ID scans, and a deleted veteran must
  // not leave them sitting in Storage with nothing pointing at them. A file
  // that won't delete stops the whole delete, so it can be retried rather
  // than orphaned.
  const attachments = await adminDb
    .collection("attachments")
    .where("veteranId", "==", id)
    .get();
  await Promise.all(
    attachments.docs
      .map((a) => String(a.data().storagePath ?? ""))
      // Only ever this veteran's own folder, whatever a record claims.
      .filter((path) => isUploadPathUnder(path, attachmentPathPrefix(id)))
      .map((path) =>
        mediaBucket().file(path).delete({ ignoreNotFound: true }),
      ),
  );

  const [encounters, linkedMedia] = await Promise.all([
    docRef.collection("encounters").listDocuments(),
    adminDb.collection("media").where("linkedVeteranId", "==", id).get(),
  ]);

  const writer = adminDb.bulkWriter();
  for (const a of attachments.docs) writer.delete(a.ref);
  for (const e of encounters) writer.delete(e);
  // The photo stays on the social wall; it just stops naming someone who's
  // no longer on the roster.
  for (const m of linkedMedia.docs) {
    writer.update(m.ref, { linkedVeteranId: null, updatedAt: new Date() });
  }
  writer.delete(docRef);
  await writer.close();
  await logAudit({
    action: "delete",
    resourceType: "veteran",
    resourceId: id,
  });

  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true };
}
