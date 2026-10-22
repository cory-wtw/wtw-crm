"use server";

import { revalidatePath } from "next/cache";
import { tidyVeteran } from "@/lib/tidy";
import { redirect } from "next/navigation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
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
  outcomeAmounts,
  outcomeInputSchema,
  outcomeSummary,
  type PipelineHistoryEntry,
  type PipelineStage,
  pipelineStageSchema,
  veteranInputSchema,
} from "@/lib/schemas";

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
  const input = tidyVeteran(parsed.data);

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
  const input = tidyVeteran(parsed.data);

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
      error: "Your account can't edit veterans.",
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

  const history: PipelineHistoryEntry[] = existing.pipelineHistory ?? [];
  const stageUpdates: Record<string, unknown> = {};

  if (stageChanged) {
    const newEntry: PipelineHistoryEntry = {
      stage: input.pipelineStage,
      enteredAt: now,
      byUid: session.uid,
    };
    stageUpdates.pipelineHistory = [...history, newEntry];
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
      error: "Your account can't change the stage.",
    };
  }

  if (existing.pipelineStage === newStage) {
    return { ok: false, error: "Already at that stage." };
  }

  const now = new Date();
  const history: PipelineHistoryEntry[] = existing.pipelineHistory ?? [];
  const newEntry: PipelineHistoryEntry = {
    stage: newStage,
    enteredAt: now,
    byUid: session.uid,
  };

  await docRef.update({
    pipelineStage: newStage,
    pipelineHistory: [...history, newEntry],
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

  // Delete encounter subcollection docs first so we don't leave orphans.
  const encounters = await docRef.collection("encounters").listDocuments();
  await Promise.all(encounters.map((e) => e.delete()));

  await docRef.delete();
  await logAudit({
    action: "delete",
    resourceType: "veteran",
    resourceId: id,
  });

  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Record a win — a job, housing, SNAP — on the veteran and on their timeline.
 *
 * The win lives on the veteran doc so the Impact report can count it from the
 * same read it already makes; the encounter is there so the timeline still
 * tells the whole story. Both commit together.
 */
export async function logOutcomeAction(
  veteranId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = outcomeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await veteranRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  if (!canEditVeteran(session, snap.data() as { assigneeUid: string | null }))
    return { ok: false, error: "Your account can't edit this veteran." };

  let resourceName: string | undefined;
  if (input.resourceId) {
    const resource = await adminDb
      .collection("resources")
      .doc(input.resourceId)
      .get();
    resourceName = resource.data()?.organizationName ?? undefined;
  }

  const now = new Date();
  const outcome = dropUndefined({
    id: crypto.randomUUID(),
    kind: input.kind,
    achievedAt: input.achievedAt,
    ...outcomeAmounts(input.kind, input.amount),
    resourceId: resourceName ? input.resourceId : undefined,
    resourceName,
    note: input.note?.trim() || undefined,
    loggedBy: session.uid,
    loggedAt: now,
  });

  const batch = adminDb.batch();
  const encounterRef = veteranRef.collection("encounters").doc();
  batch.set(encounterRef, {
    type: "outcome",
    occurredAt: input.achievedAt,
    loggedBy: session.uid,
    summary: outcomeSummary({ ...outcome, kind: input.kind }),
    createdAt: now,
  });
  batch.update(veteranRef, {
    outcomes: FieldValue.arrayUnion(outcome),
    updatedAt: now,
    updatedBy: session.uid,
  });
  await batch.commit();

  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: { outcomes: { before: null, after: `${outcome.id}: ${input.kind}` } },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/finances/impact");
  return { ok: true };
}

/** Take back a win logged by mistake. The timeline entry stays as history. */
export async function removeOutcomeAction(
  veteranId: string,
  outcomeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  // A transaction, so a win added by someone else between the read and the
  // write isn't dropped by writing back a stale list.
  const result = await adminDb.runTransaction<
    { error: string } | { removed: { id: string; kind: string } }
  >(async (tx) => {
    const snap = await tx.get(veteranRef);
    if (!snap.exists) return { error: "Veteran not found." };
    const data = snap.data()!;
    if (!canEditVeteran(session, data as { assigneeUid: string | null }))
      return { error: "Your account can't edit this veteran." };

    const outcomes = (data.outcomes ?? []) as Array<{ id: string; kind: string }>;
    const removed = outcomes.find((o) => o.id === outcomeId);
    if (!removed) return { error: "That win is no longer on the record." };

    tx.update(veteranRef, {
      outcomes: outcomes.filter((o) => o.id !== outcomeId),
      updatedAt: new Date(),
      updatedBy: session.uid,
    });
    return { removed };
  });
  if ("error" in result) return { ok: false, error: result.error };
  const { removed } = result;
  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: { outcomes: { before: `${removed.id}: ${removed.kind}`, after: null } },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/finances/impact");
  return { ok: true };
}
