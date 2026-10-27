/**
 * Proposing and deciding Claude change requests. Server-only.
 *
 * Proposing writes a `changeRequests` doc and nothing else. Approving runs in
 * one transaction that re-reads the record, refuses if any field it touches
 * has moved since the proposal (marking the request stale instead), re-runs
 * the full validation, and writes the record, the audit entry and the
 * decision together — so a change is never half-applied or unaudited.
 */

import "server-only";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  driftedFields,
  planEncounterCreate,
  planVeteranCreate,
  planVeteranUpdate,
  planVsoCreate,
  planVsoUpdate,
  veteranLabel,
  veteranSnapshot,
  vsoLabel,
  vsoSnapshot,
  type Plan,
} from "@/lib/change-requests";
import {
  isExpired,
  type ChangeRequest,
  type ChangeRequestKind,
  type FieldChanges,
  type PipelineHistoryEntry,
  type PipelineStage,
} from "@/lib/schemas";

const COLLECTION = "changeRequests";

/** Who a proposal is attributed to in the queue and the audit log. */
export const MCP_ACTOR = { uid: "claude-mcp", email: "claude-mcp" };

type Actor = { uid: string; email: string };

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(id: string, data: FirebaseFirestore.DocumentData): ChangeRequest {
  return {
    id,
    kind: data.kind,
    status: data.status ?? "pending",
    targetId: data.targetId ?? null,
    targetLabel: data.targetLabel ?? "",
    changes: (data.changes ?? {}) as FieldChanges,
    reason: data.reason ?? "",
    proposedBy: data.proposedBy ?? "",
    proposedAt: tsToDate(data.proposedAt) ?? new Date(0),
    reviewedBy: data.reviewedBy ?? null,
    reviewedByEmail: data.reviewedByEmail ?? null,
    reviewedAt: tsToDate(data.reviewedAt),
    reviewNote: data.reviewNote ?? null,
    appliedId: data.appliedId ?? null,
  };
}

export async function listChangeRequests(
  status?: ChangeRequest["status"],
  limit = 50,
): Promise<ChangeRequest[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
  if (status) query = query.where("status", "==", status);
  // Sorted here rather than with orderBy so the status filter doesn't need a
  // composite index.
  const snap = await query.get();
  return snap.docs
    .map((d) => deserialize(d.id, d.data()))
    .sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime())
    .slice(0, limit);
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  return snap.exists ? deserialize(snap.id, snap.data()!) : null;
}

export type ProposeInput =
  | { kind: "veteran.create"; fields: unknown; reason: string }
  | { kind: "veteran.update"; targetId: string; changes: unknown; reason: string }
  | { kind: "vso.create"; fields: unknown; reason: string }
  | { kind: "vso.update"; targetId: string; changes: unknown; reason: string }
  | { kind: "encounter.create"; targetId: string; fields: unknown; reason: string };

export type ProposeResult =
  | { ok: true; request: ChangeRequest }
  | { ok: false; error: string };

async function missingVsoIds(changes: FieldChanges): Promise<string[]> {
  const ids = changes.vsoIds?.after;
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const snaps = await Promise.all(
    ids.map((id) => adminDb.collection("vsos").doc(String(id)).get()),
  );
  return ids.filter((_, i) => !snaps[i].exists).map(String);
}

/** Validate a proposal against the current record and queue it. Writes only
 *  the request (and its audit entry) — never the record. */
export async function proposeChange(input: ProposeInput): Promise<ProposeResult> {
  const reason = input.reason?.trim();
  if (!reason) return { ok: false, error: "reason: Say why — the reviewer needs it." };

  let plan: Plan;
  let targetId: string | null = null;
  let targetLabel: string;

  switch (input.kind) {
    case "veteran.create": {
      plan = planVeteranCreate(input.fields);
      targetLabel = plan.ok
        ? veteranLabel({
            firstName: plan.changes.firstName?.after,
            lastInitial: plan.changes.lastInitial?.after,
          })
        : "";
      break;
    }
    case "veteran.update":
    case "encounter.create": {
      const snap = await adminDb.collection("veterans").doc(input.targetId).get();
      if (!snap.exists) return { ok: false, error: "Veteran not found." };
      const data = snap.data()!;
      plan =
        input.kind === "veteran.update"
          ? planVeteranUpdate(data, input.changes)
          : planEncounterCreate(input.fields);
      targetId = snap.id;
      targetLabel = veteranLabel(data);
      break;
    }
    case "vso.create": {
      plan = planVsoCreate(input.fields);
      targetLabel = plan.ok ? vsoLabel({ fullName: plan.changes.fullName?.after, affiliation: plan.changes.affiliation?.after }) : "";
      break;
    }
    case "vso.update": {
      const snap = await adminDb.collection("vsos").doc(input.targetId).get();
      if (!snap.exists) return { ok: false, error: "VSO not found." };
      const data = snap.data()!;
      plan = planVsoUpdate(data, input.changes);
      targetId = snap.id;
      targetLabel = vsoLabel(data);
      break;
    }
  }
  if (!plan.ok) return plan;

  const missing = await missingVsoIds(plan.changes);
  if (missing.length > 0) {
    return { ok: false, error: `vsoIds: no VSO with id ${missing.join(", ")}.` };
  }

  const now = new Date();
  const ref = adminDb.collection(COLLECTION).doc();
  const doc = {
    kind: input.kind,
    status: "pending",
    targetId,
    targetLabel,
    changes: plan.changes,
    reason,
    proposedBy: MCP_ACTOR.uid,
    proposedAt: now,
    reviewedBy: null,
    reviewedByEmail: null,
    reviewedAt: null,
    reviewNote: null,
    appliedId: null,
  };
  const batch = adminDb.batch();
  batch.set(ref, doc);
  batch.set(adminDb.collection("auditLog").doc(), {
    actorUid: MCP_ACTOR.uid,
    actorEmail: MCP_ACTOR.email,
    action: "create",
    resourceType: "changeRequest",
    resourceId: ref.id,
    diff: plan.changes,
    at: now,
  });
  await batch.commit();
  return { ok: true, request: deserialize(ref.id, doc) };
}

/** Claude taking back its own proposal. Only a pending one. */
export async function withdrawChange(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ref = adminDb.collection(COLLECTION).doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: "Change request not found." };
    if (snap.data()!.status !== "pending") {
      return { ok: false as const, error: `It's already ${snap.data()!.status}.` };
    }
    const now = new Date();
    tx.update(ref, { status: "withdrawn", reviewedAt: now });
    tx.set(adminDb.collection("auditLog").doc(), {
      actorUid: MCP_ACTOR.uid,
      actorEmail: MCP_ACTOR.email,
      action: "update",
      resourceType: "changeRequest",
      resourceId: id,
      diff: { status: { before: "pending", after: "withdrawn" } },
      at: now,
    });
    return { ok: true as const };
  });
}

export type DecideResult =
  | { ok: true; status: "approved" | "rejected"; appliedId: string | null }
  | { ok: false; error: string; status?: "stale" };

function dateFieldForStage(stage: PipelineStage): string {
  return {
    found: "dateFound",
    connected: "dateConnected",
    filed: "dateFiled",
    won: "dateWon",
    lost: "dateLost",
  }[stage];
}

function afterValues(changes: FieldChanges): Record<string, unknown> {
  return Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.after]));
}

/** Firestore drops nothing for undefined but refuses it; nulls clear fields. */
function withoutNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

type Applied = { appliedId: string | null; resourceType: "veteran" | "vso" | "encounter"; resourceId: string };
class Stale extends Error {}
class Invalid extends Error {}

/** Same plan the proposal ran, against the record as it is now. The request's
 *  changes must come out identical — anything else means the world moved. */
function recheck(plan: Plan, expected: FieldChanges): void {
  if (!plan.ok) throw new Invalid(plan.error);
  if (JSON.stringify(plan.changes) !== JSON.stringify(expected)) {
    throw new Stale("The record no longer matches what this change was built from.");
  }
}

async function apply(tx: Transaction, cr: ChangeRequest, actor: Actor, now: Date): Promise<Applied> {
  const after = afterValues(cr.changes);

  switch (cr.kind as ChangeRequestKind) {
    case "veteran.update": {
      const ref = adminDb.collection("veterans").doc(cr.targetId!);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Stale("The veteran has been deleted.");
      const data = snap.data()!;
      const drifted = driftedFields(veteranSnapshot(data), cr.changes);
      if (drifted.length > 0) throw new Stale(`Changed since proposed: ${drifted.join(", ")}.`);
      recheck(planVeteranUpdate(data, after), cr.changes);

      const updates: Record<string, unknown> = { ...after, updatedBy: actor.uid, updatedAt: now };
      if (cr.changes.pipelineStage) {
        const stage = after.pipelineStage as PipelineStage;
        const history = (data.pipelineHistory ?? []) as PipelineHistoryEntry[];
        updates.pipelineHistory = [...history, { stage, enteredAt: now, byUid: actor.uid }];
        updates[dateFieldForStage(stage)] = now;
      }
      tx.update(ref, updates);
      return { appliedId: null, resourceType: "veteran", resourceId: ref.id };
    }

    case "veteran.create": {
      recheck(planVeteranCreate(withoutNulls(after)), cr.changes);
      const stage = (after.pipelineStage as PipelineStage | undefined) ?? "found";
      const ref = adminDb.collection("veterans").doc();
      tx.set(ref, {
        ...withoutNulls(after),
        pipelineStage: stage,
        pipelineHistory: [{ stage, enteredAt: now, byUid: actor.uid }],
        dateFound: stage === "found" ? now : null,
        dateConnected: null,
        dateFiled: null,
        dateWon: null,
        dateLost: null,
        vsoIds: after.vsoIds ?? [],
        assigneeUid: after.assigneeUid ?? actor.uid,
        lastContactedAt: now,
        createdBy: actor.uid,
        createdAt: now,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      return { appliedId: ref.id, resourceType: "veteran", resourceId: ref.id };
    }

    case "vso.update": {
      const ref = adminDb.collection("vsos").doc(cr.targetId!);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Stale("The VSO has been deleted.");
      const data = snap.data()!;
      const drifted = driftedFields(vsoSnapshot(data), cr.changes);
      if (drifted.length > 0) throw new Stale(`Changed since proposed: ${drifted.join(", ")}.`);
      recheck(planVsoUpdate(data, after), cr.changes);
      tx.update(ref, { ...after, updatedBy: actor.uid, updatedAt: now });
      return { appliedId: null, resourceType: "vso", resourceId: ref.id };
    }

    case "vso.create": {
      recheck(planVsoCreate(withoutNulls(after)), cr.changes);
      const ref = adminDb.collection("vsos").doc();
      tx.set(ref, {
        ...withoutNulls(after),
        partnershipStatus: after.partnershipStatus ?? "in_discussion",
        referralsMade: 0,
        createdBy: actor.uid,
        createdAt: now,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      return { appliedId: ref.id, resourceType: "vso", resourceId: ref.id };
    }

    case "encounter.create": {
      const veteranRef = adminDb.collection("veterans").doc(cr.targetId!);
      const snap = await tx.get(veteranRef);
      if (!snap.exists) throw new Stale("The veteran has been deleted.");
      recheck(planEncounterCreate(withoutNulls(after), now), cr.changes);

      const occurredAt = new Date(String(after.occurredAt));
      const encounterRef = veteranRef.collection("encounters").doc();
      tx.set(encounterRef, {
        ...withoutNulls(after),
        type: "note",
        occurredAt,
        nextStepDueAt: after.nextStepDueAt ? new Date(String(after.nextStepDueAt)) : null,
        loggedBy: actor.uid,
        createdAt: now,
      });
      // Same as addEncounterAction: lastContactedAt only ever moves forward.
      const existing = tsToDate(snap.data()!.lastContactedAt);
      tx.update(veteranRef, {
        lastContactedAt: existing && existing > occurredAt ? existing : occurredAt,
        updatedAt: now,
        updatedBy: actor.uid,
      });
      return {
        appliedId: encounterRef.id,
        resourceType: "encounter",
        resourceId: `${veteranRef.id}/${encounterRef.id}`,
      };
    }
  }
}

/**
 * An admin's decision. `actor` must already be checked as an admin by the
 * caller. Approving applies the change in the same transaction that records
 * the decision; a stale or invalid request is never applied.
 */
export async function decideChange(
  id: string,
  decision: "approve" | "reject",
  actor: Actor,
  note?: string,
): Promise<DecideResult> {
  const ref = adminDb.collection(COLLECTION).doc(id);
  const reviewNote = note?.trim() || null;

  try {
    return await adminDb.runTransaction(async (tx): Promise<DecideResult> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, error: "Change request not found." };
      const cr = deserialize(snap.id, snap.data()!);
      if (cr.status !== "pending") return { ok: false, error: `It's already ${cr.status}.` };

      const now = new Date();
      const decided = {
        reviewedBy: actor.uid,
        reviewedByEmail: actor.email,
        reviewedAt: now,
        reviewNote,
      };
      const auditDecision = (status: string) =>
        tx.set(adminDb.collection("auditLog").doc(), {
          actorUid: actor.uid,
          actorEmail: actor.email,
          action: "update",
          resourceType: "changeRequest",
          resourceId: id,
          diff: { status: { before: "pending", after: status } },
          at: now,
        });

      if (decision === "reject") {
        tx.update(ref, { status: "rejected", ...decided });
        auditDecision("rejected");
        return { ok: true, status: "rejected", appliedId: null };
      }

      if (isExpired(cr.proposedAt, now)) {
        throw new Stale("It's more than a week old. Ask Claude to look again and re-propose.");
      }

      let applied: Applied;
      try {
        applied = await apply(tx, cr, actor, now);
      } catch (err) {
        if (err instanceof Invalid) {
          return { ok: false, error: `No longer valid: ${err.message}` };
        }
        throw err;
      }

      tx.update(ref, { status: "approved", appliedId: applied.appliedId, ...decided });
      auditDecision("approved");
      tx.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: cr.kind.endsWith(".update") ? "update" : "create",
        resourceType: applied.resourceType,
        resourceId: applied.resourceId,
        diff: cr.changes,
        at: now,
      });
      return { ok: true, status: "approved", appliedId: applied.appliedId };
    });
  } catch (err) {
    if (!(err instanceof Stale)) throw err;
    // Outside the failed transaction: retire it so it leaves the queue and
    // Claude sees why on its next look.
    await ref.update({
      status: "stale",
      reviewedBy: actor.uid,
      reviewedByEmail: actor.email,
      reviewedAt: new Date(),
      reviewNote: err.message,
    });
    return { ok: false, status: "stale", error: `${err.message} Marked out of date — nothing was changed.` };
  }
}
