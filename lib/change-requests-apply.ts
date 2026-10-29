/**
 * Proposing and deciding Claude change requests. Server-only.
 *
 * Proposing writes a `changeRequests` doc and nothing else. Approving comes
 * in two shapes:
 *
 * - Field writes (veterans, VSOs, contact notes) run in one transaction that
 *   re-reads the record, refuses if any field it touches has moved since the
 *   proposal (marking the request stale instead), re-runs the validation, and
 *   writes the record, the audit entry and the decision together.
 *
 * - Everything else (intakes, referrals, follow-ups, wins, resources,
 *   transactions) runs the very same code the app's own buttons run
 *   (lib/ops). The request is claimed first — pending → applying — so a
 *   double tap can't apply it twice; edits are checked for drift before the
 *   write; and a failure puts the request back to pending with the reason.
 */

import "server-only";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getResourcesByIds } from "@/lib/db/resources";
import {
  noonIfDateOnly,
  buildResourceInput,
  buildTransactionInput,
  driftedFields,
  planEncounterCreate,
  planResourceCreate,
  planResourceUpdate,
  planTransactionCreate,
  planTransactionUpdate,
  planVeteranCreate,
  planVeteranUpdate,
  planVsoCreate,
  planVsoUpdate,
  resourceSnapshot,
  transactionSnapshot,
  veteranLabel,
  veteranSnapshot,
  vsoLabel,
  vsoSnapshot,
  type Plan,
} from "@/lib/change-requests";
import {
  createReferral,
  matchIntake,
  recordIntake,
  referralInputSchema,
  type IntakeRecord,
  type IntakeResult,
} from "@/lib/ops/concierge";
import { followUpInputSchema, recordFollowUp } from "@/lib/ops/follow-up";
import { logOutcome } from "@/lib/ops/outcome";
import { createResource, editResource } from "@/lib/ops/resources";
import { loadCategory, saveTransaction } from "@/lib/ops/transactions";
import type { Actor, OnCommit } from "@/lib/ops/actor";
import {
  FOLLOW_UP_OUTCOME_LABELS,
  OUTCOME_KIND_INFO,
  PENDING_PREFIX,
  isExpired,
  outcomeInputSchema,
  pendingRequestId,
  type ChangeRequest,
  type ChangeRequestKind,
  type FieldChanges,
  type PipelineHistoryEntry,
  type PipelineStage,
} from "@/lib/schemas";

const COLLECTION = "changeRequests";

/** How long an approval may hold a request in "applying" before another tap
 *  may take it over. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Proposals are stored under this uid plus the admin whose connector sent
 *  them, so the queue and the audit log both say "via Claude". */
export const MCP_UID = "claude-mcp";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
    payload: data.payload ?? null,
    reason: data.reason ?? "",
    groupLabel: data.groupLabel ?? null,
    proposedBy: data.proposedBy ?? "",
    proposedByEmail: data.proposedByEmail ?? null,
    proposedAt: tsToDate(data.proposedAt) ?? new Date(0),
    reviewedBy: data.reviewedBy ?? null,
    reviewedByEmail: data.reviewedByEmail ?? null,
    reviewedAt: tsToDate(data.reviewedAt),
    reviewNote: data.reviewNote ?? null,
    appliedId: data.appliedId ?? null,
    result: data.result ?? null,
    lastError: data.lastError ?? null,
  };
}

export async function listChangeRequests(
  status?: ChangeRequest["status"],
  limit = 50,
): Promise<ChangeRequest[]> {
  // The full history only ever grows, so without a status it's the newest
  // `limit`, read in order. The pending queue is small enough to sort here —
  // which keeps the status filter clear of a composite index.
  if (!status) {
    const recent = await adminDb.collection(COLLECTION).orderBy("proposedAt", "desc").limit(limit).get();
    return recent.docs.map((d) => deserialize(d.id, d.data()));
  }
  const query = adminDb.collection(COLLECTION).where("status", "==", status);
  // Sorted here rather than with orderBy so the status filter doesn't need a
  // composite index.
  const snap = await query.get();
  return snap.docs
    .map((d) => deserialize(d.id, d.data()))
    .sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime())
    .slice(0, limit);
}

export async function getChangeRequest(id: string): Promise<ChangeRequest | null> {
  if (!id || id.includes("/")) return null;
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  return snap.exists ? deserialize(snap.id, snap.data()!) : null;
}

// ---------------------------------------------------------------------------
// Proposing

/** Who is proposing: the admin whose Claude connector made the call. */
export type Proposer = { uid: string; email: string };

type Prepared = {
  kind: ChangeRequestKind;
  targetId: string | null;
  targetLabel: string;
  changes: FieldChanges;
  payload?: Record<string, unknown> | null;
};

export type ProposeResult = Result<{ request: ChangeRequest }>;

type VeteranForPropose = { targetId: string; label: string; data: FirebaseFirestore.DocumentData };

/**
 * The veteran a proposal is about — a stored one, or one Claude proposed
 * earlier in the same call ("pending:<id>"), read from its proposed fields.
 * An approved pending create resolves to the real record.
 */
async function veteranForPropose(veteranId: string): Promise<Result<VeteranForPropose>> {
  const pendingId = pendingRequestId(veteranId);
  if (pendingId) {
    const cr = await getChangeRequest(pendingId);
    if (!cr || cr.kind !== "veteran.create") {
      return { ok: false, error: `No proposed new veteran ${veteranId}.` };
    }
    if (cr.status === "approved" && cr.appliedId) return veteranForPropose(cr.appliedId);
    if (cr.status !== "pending") {
      return { ok: false, error: `That new veteran was ${cr.status}; it can't take more changes.` };
    }
    const data = Object.fromEntries(Object.entries(cr.changes).map(([k, c]) => [k, c.after]));
    return { ok: true, targetId: veteranId, label: `${cr.targetLabel} (new)`, data };
  }
  if (!veteranId || veteranId.includes("/")) return { ok: false, error: "Veteran not found." };
  const snap = await adminDb.collection("veterans").doc(veteranId).get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  return { ok: true, targetId: snap.id, label: veteranLabel(snap.data()!), data: snap.data()! };
}

async function queue(
  proposer: Proposer,
  prepared: Prepared,
  reasonRaw: string,
  groupRaw?: string,
): Promise<ProposeResult> {
  const reason = reasonRaw?.trim();
  if (!reason) return { ok: false, error: "reason: Say why — the reviewer needs it." };
  const groupLabel = groupRaw?.trim().slice(0, 120) || null;

  const now = new Date();
  const ref = adminDb.collection(COLLECTION).doc();
  const doc = {
    kind: prepared.kind,
    status: "pending",
    targetId: prepared.targetId,
    targetLabel: prepared.targetLabel,
    // Through JSON: Firestore refuses undefined, and optional fields left
    // blank arrive as exactly that.
    changes: JSON.parse(JSON.stringify(prepared.changes)) as FieldChanges,
    payload: prepared.payload ? (JSON.parse(JSON.stringify(prepared.payload)) as Record<string, unknown>) : null,
    reason,
    groupLabel,
    proposedBy: MCP_UID,
    proposedByEmail: proposer.email,
    proposedAt: now,
    reviewedBy: null,
    reviewedByEmail: null,
    reviewedAt: null,
    reviewNote: null,
    appliedId: null,
    result: null,
    lastError: null,
  };
  const batch = adminDb.batch();
  batch.set(ref, doc);
  batch.set(adminDb.collection("auditLog").doc(), {
    actorUid: proposer.uid,
    actorEmail: `${proposer.email} (via Claude)`,
    action: "create",
    resourceType: "changeRequest",
    resourceId: ref.id,
    diff: prepared.changes,
    at: now,
  });
  await batch.commit();
  return { ok: true, request: deserialize(ref.id, doc) };
}

async function missingVsoIds(changes: FieldChanges): Promise<string[]> {
  const ids = changes.vsoIds?.after;
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const snaps = await Promise.all(
    ids.map((id) => adminDb.collection("vsos").doc(String(id)).get()),
  );
  return ids.filter((_, i) => !snaps[i].exists).map(String);
}

function fromPlan(plan: Plan, rest: Omit<Prepared, "changes">): Result<{ prepared: Prepared }> {
  return plan.ok ? { ok: true, prepared: { ...rest, changes: plan.changes } } : plan;
}

export type FieldProposal =
  | { kind: "veteran.create"; fields: unknown }
  | { kind: "veteran.update"; targetId: string; changes: unknown }
  | { kind: "vso.create"; fields: unknown }
  | { kind: "vso.update"; targetId: string; changes: unknown }
  | { kind: "encounter.create"; targetId: string; fields: unknown }
  | { kind: "resource.create"; fields: unknown }
  | { kind: "resource.update"; targetId: string; changes: unknown }
  | { kind: "transaction.create"; fields: unknown }
  | { kind: "transaction.update"; targetId: string; changes: unknown };

async function readDoc(collection: string, id: string) {
  if (!id || id.includes("/")) return null;
  const snap = await adminDb.collection(collection).doc(id).get();
  return snap.exists ? snap : null;
}

async function prepareFields(p: FieldProposal): Promise<Result<{ prepared: Prepared }>> {
  switch (p.kind) {
    case "veteran.create": {
      const plan = planVeteranCreate(p.fields);
      return fromPlan(plan, {
        kind: p.kind,
        targetId: null,
        targetLabel: plan.ok
          ? veteranLabel({ firstName: plan.changes.firstName?.after, lastInitial: plan.changes.lastInitial?.after })
          : "",
      });
    }
    case "veteran.update": {
      if (pendingRequestId(p.targetId)) {
        return { ok: false, error: "Change the proposed new veteran by withdrawing it and proposing it again." };
      }
      const snap = await readDoc("veterans", p.targetId);
      if (!snap) return { ok: false, error: "Veteran not found." };
      return fromPlan(planVeteranUpdate(snap.data()!, p.changes), {
        kind: p.kind,
        targetId: snap.id,
        targetLabel: veteranLabel(snap.data()!),
      });
    }
    case "encounter.create": {
      const v = await veteranForPropose(p.targetId);
      if (!v.ok) return v;
      return fromPlan(planEncounterCreate(p.fields), { kind: p.kind, targetId: v.targetId, targetLabel: v.label });
    }
    case "vso.create": {
      const plan = planVsoCreate(p.fields);
      return fromPlan(plan, {
        kind: p.kind,
        targetId: null,
        targetLabel: plan.ok
          ? vsoLabel({ fullName: plan.changes.fullName?.after, affiliation: plan.changes.affiliation?.after })
          : "",
      });
    }
    case "vso.update": {
      const snap = await readDoc("vsos", p.targetId);
      if (!snap) return { ok: false, error: "VSO not found." };
      return fromPlan(planVsoUpdate(snap.data()!, p.changes), {
        kind: p.kind,
        targetId: snap.id,
        targetLabel: vsoLabel(snap.data()!),
      });
    }
    case "resource.create": {
      const plan = planResourceCreate(p.fields);
      return fromPlan(plan, {
        kind: p.kind,
        targetId: null,
        targetLabel: plan.ok ? String(plan.changes.organizationName?.after ?? "") : "",
      });
    }
    case "resource.update": {
      const snap = await readDoc("resources", p.targetId);
      if (!snap) return { ok: false, error: "Resource not found." };
      return fromPlan(planResourceUpdate(snap.data()!, p.changes), {
        kind: p.kind,
        targetId: snap.id,
        targetLabel: String(snap.data()!.organizationName ?? ""),
      });
    }
    case "transaction.create":
    case "transaction.update": {
      const snap = p.kind === "transaction.update" ? await readDoc("transactions", p.targetId) : null;
      if (p.kind === "transaction.update" && !snap) return { ok: false, error: "Transaction not found." };
      const plan =
        p.kind === "transaction.create"
          ? planTransactionCreate(p.fields)
          : planTransactionUpdate(snap!.data()!, p.changes);
      if (!plan.ok) return plan;
      // The category has to exist and match the money's direction — the
      // same check the form's save runs, done now so Claude hears it now.
      const merged = { ...(snap ? transactionSnapshot(snap.data()!) : {}), ...Object.fromEntries(Object.entries(plan.changes).map(([k, c]) => [k, c.after])) };
      const category = await loadCategory(String(merged.categoryId ?? ""));
      if (!category) return { ok: false, error: "categoryId: no such category (use list_finance_categories)." };
      if (category.type !== merged.type) {
        return { ok: false, error: `categoryId: "${category.name}" is an ${category.type} category.` };
      }
      const label = `${merged.date} · ${merged.vendor || merged.donorName || category.name} · $${Number(merged.amount).toFixed(2)}`;
      return fromPlan(plan, { kind: p.kind, targetId: snap?.id ?? null, targetLabel: label });
    }
  }
}

/** Every field-shaped proposal: veterans, VSOs, contact notes, resources,
 *  transactions. */
export async function proposeFields(
  proposer: Proposer,
  proposal: FieldProposal,
  reason: string,
  group?: string,
): Promise<ProposeResult> {
  const prepared = await prepareFields(proposal);
  if (!prepared.ok) return prepared;
  const missing = await missingVsoIds(prepared.prepared.changes);
  if (missing.length > 0) {
    return { ok: false, error: `vsoIds: no VSO with id ${missing.join(", ")}.` };
  }
  return queue(proposer, prepared.prepared, reason, group);
}

/**
 * Run the matcher on what the veteran said and queue the intake record. The
 * answers that are never stored — safeTonight, receivingVaBenefits,
 * situations, housing — steer this match and are not in the request.
 */
export async function proposeIntake(
  proposer: Proposer,
  veteranId: string,
  answers: unknown,
  reason: string,
  group?: string,
): Promise<Result<{ request: ChangeRequest; match: IntakeResult }>> {
  const v = await veteranForPropose(veteranId);
  if (!v.ok) return v;
  const matched = await matchIntake(v.data, answers);
  if (!matched.ok) return matched;
  const r = matched.record;
  const changes: FieldChanges = {
    needs: { before: null, after: r.needs },
    ...Object.fromEntries(
      Object.entries(r.eligibility)
        .filter(([, value]) => value !== undefined)
        .map(([k, value]) => [k, { before: v.data[k] ?? null, after: value }]),
    ),
    candidatesFound: { before: null, after: `${r.candidatesFound} of ${r.consideredCount}` },
  };
  const queued = await queue(
    proposer,
    {
      kind: "intake.record",
      targetId: v.targetId,
      targetLabel: v.label,
      changes,
      payload: r as unknown as Record<string, unknown>,
    },
    reason,
    group,
  );
  return queued.ok ? { ok: true, request: queued.request, match: matched.result } : queued;
}

export async function proposeReferral(
  proposer: Proposer,
  veteranId: string,
  input: unknown,
  reason: string,
  group?: string,
): Promise<ProposeResult> {
  const v = await veteranForPropose(veteranId);
  if (!v.ok) return v;
  const parsed = referralInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const resources = await getResourcesByIds(parsed.data.referrals.map((r) => r.resourceId));
  const names = new Map(resources.map((r) => [r.id, r.organizationName]));
  const missing = parsed.data.referrals.filter((r) => !names.has(r.resourceId));
  if (missing.length > 0) {
    return { ok: false, error: `No resource with id ${missing.map((m) => m.resourceId).join(", ")}.` };
  }
  return queue(
    proposer,
    {
      kind: "referral.create",
      targetId: v.targetId,
      targetLabel: v.label,
      changes: {
        resources: {
          before: null,
          after: [...parsed.data.referrals].sort((a, b) => a.rank - b.rank).map((r) => names.get(r.resourceId)),
        },
        needs: { before: null, after: parsed.data.bucketsIdentified },
      },
      payload: parsed.data as unknown as Record<string, unknown>,
    },
    reason,
    group,
  );
}

export async function proposeFollowUp(
  proposer: Proposer,
  veteranId: string,
  input: unknown,
  reason: string,
  group?: string,
): Promise<ProposeResult> {
  const v = await veteranForPropose(veteranId);
  if (!v.ok) return v;
  if (pendingRequestId(v.targetId)) return { ok: false, error: "A new veteran has no referral to follow up yet." };
  const parsed = followUpInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const referral = await adminDb
    .collection("veterans").doc(v.targetId)
    .collection("encounters").doc(parsed.data.referralEncounterId).get();
  if (!referral.exists || referral.data()!.type !== "referral") {
    return { ok: false, error: "referralEncounterId: no such referral on this veteran (see get_veteran → openReferrals)." };
  }
  if (referral.data()!.followUpCompleted) {
    return { ok: false, error: "That referral's follow-up is already recorded." };
  }
  const names = new Map(
    ((referral.data()!.referrals ?? []) as { resourceId: string; resourceName: string }[]).map((r) => [r.resourceId, r.resourceName]),
  );
  const strangers = parsed.data.outcomes.filter((o) => !names.has(o.resourceId));
  if (strangers.length > 0) {
    return { ok: false, error: `Not in that referral: ${strangers.map((o) => o.resourceId).join(", ")}.` };
  }
  const changes: FieldChanges = Object.fromEntries(
    parsed.data.outcomes.map((o) => [
      names.get(o.resourceId) ?? o.resourceId,
      {
        before: null,
        after: [
          FOLLOW_UP_OUTCOME_LABELS[o.outcome],
          o.winKind ? `win: ${OUTCOME_KIND_INFO[o.winKind].label}` : null,
          o.amount ? `$${o.amount}` : null,
          o.note,
        ].filter(Boolean).join(" — "),
      },
    ]),
  );
  return queue(
    proposer,
    { kind: "followUp.record", targetId: v.targetId, targetLabel: v.label, changes, payload: parsed.data as unknown as Record<string, unknown> },
    reason,
    group,
  );
}

export async function proposeOutcome(
  proposer: Proposer,
  veteranId: string,
  input: unknown,
  reason: string,
  group?: string,
): Promise<ProposeResult> {
  const v = await veteranForPropose(veteranId);
  if (!v.ok) return v;
  const raw = (input ?? {}) as Record<string, unknown>;
  const parsed = outcomeInputSchema.safeParse({ ...raw, achievedAt: noonIfDateOnly(raw.achievedAt) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const o = parsed.data;
  if (o.achievedAt.getTime() > Date.now() + 60 * 60 * 1000) {
    return { ok: false, error: "achievedAt: A win can't be in the future." };
  }
  let resourceName: string | null = null;
  if (o.resourceId) {
    const r = await readDoc("resources", o.resourceId);
    if (!r) return { ok: false, error: "resourceId: no such resource." };
    resourceName = r.data()!.organizationName ?? null;
  }
  return queue(
    proposer,
    {
      kind: "outcome.log",
      targetId: v.targetId,
      targetLabel: v.label,
      changes: {
        win: { before: null, after: OUTCOME_KIND_INFO[o.kind].label },
        achievedAt: { before: null, after: o.achievedAt.toISOString() },
        ...(o.amount ? { amount: { before: null, after: o.amount } } : {}),
        ...(resourceName ? { via: { before: null, after: resourceName } } : {}),
        ...(o.note ? { note: { before: null, after: o.note } } : {}),
      },
      payload: { ...o, achievedAt: o.achievedAt.toISOString() },
    },
    reason,
    group,
  );
}

/** Claude taking back its own proposal. Only a pending one. */
export async function withdrawChange(proposer: Proposer, id: string): Promise<Result> {
  if (!id || id.includes("/")) return { ok: false, error: "Change request not found." };
  const ref = adminDb.collection(COLLECTION).doc(id);
  return adminDb.runTransaction(async (tx): Promise<Result> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: "Change request not found." };
    if (snap.data()!.status !== "pending") {
      return { ok: false, error: `It's already ${snap.data()!.status}.` };
    }
    const now = new Date();
    tx.update(ref, { status: "withdrawn", reviewedAt: now });
    tx.set(adminDb.collection("auditLog").doc(), {
      actorUid: proposer.uid,
      actorEmail: `${proposer.email} (via Claude)`,
      action: "update",
      resourceType: "changeRequest",
      resourceId: id,
      diff: { status: { before: "pending", after: "withdrawn" } },
      at: now,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Deciding

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

/** Firestore refuses undefined; nulls would clear fields a create never had. */
function withoutNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

/** The world moved: never applied, marked out of date. */
class Stale extends Error {}
/** Can't apply yet or any more, but nothing's wrong with the request's
 *  facts: it stays pending with the reason. */
class Blocked extends Error {}

/** A target that's a proposed new veteran resolves once that's approved. */
async function resolveVeteranTarget(targetId: string, tx?: Transaction): Promise<string> {
  const pendingId = pendingRequestId(targetId);
  if (!pendingId) return targetId;
  const ref = adminDb.collection(COLLECTION).doc(pendingId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const cr = snap.exists ? snap.data()! : null;
  if (cr?.status === "approved" && cr.appliedId) return cr.appliedId as string;
  if (cr?.status === "pending" || cr?.status === "applying") {
    throw new Blocked(`Approve the new veteran (${cr.targetLabel}) first.`);
  }
  throw new Stale(`The new veteran it was for was ${cr?.status ?? "removed"}.`);
}

/** JSON with object keys sorted: Firestore doesn't promise to hand a map's
 *  keys back in the order they were written. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/** Same plan the proposal ran, against the record as it is now. The request's
 *  changes must come out identical — anything else means the world moved. */
function recheck(plan: Plan, expected: FieldChanges): void {
  if (!plan.ok) throw new Blocked(`No longer valid: ${plan.error}`);
  if (stableJson(plan.changes) !== stableJson(expected)) {
    throw new Stale("The record no longer matches what this change was built from.");
  }
}

type Applied = { appliedId: string | null; resourceType: "veteran" | "vso" | "encounter"; resourceId: string };

const FIELD_KINDS = new Set<ChangeRequestKind>([
  "veteran.create",
  "veteran.update",
  "vso.create",
  "vso.update",
  "encounter.create",
]);

async function applyFields(tx: Transaction, cr: ChangeRequest, actor: Actor, now: Date): Promise<Applied> {
  const after = afterValues(cr.changes);

  switch (cr.kind) {
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
        assigneeUid: after.assigneeUid ?? null,
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
      const veteranId = await resolveVeteranTarget(cr.targetId!, tx);
      const veteranRef = adminDb.collection("veterans").doc(veteranId);
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

    default:
      throw new Error(`${cr.kind} isn't a field write.`);
  }
}

/**
 * Run the app's own code for a request, as the approving admin. `onCommit`
 * adds the request's "approved" write to the op's own batch, so the change and
 * its approval land together or not at all. Throws Stale/Blocked; an op's own
 * error comes back as Blocked.
 */
async function applyOp(cr: ChangeRequest, actor: Actor, onCommit: OnCommit): Promise<void> {
  const payload = cr.payload ?? {};
  const after = afterValues(cr.changes);
  const unwrap = <T extends object>(r: Result<T>): T => {
    if (!r.ok) throw new Blocked(r.error);
    return r;
  };

  switch (cr.kind) {
    case "intake.record": {
      const veteranId = await resolveVeteranTarget(cr.targetId!);
      unwrap(await recordIntake(actor, veteranId, payload as unknown as IntakeRecord, onCommit));
      return;
    }
    case "referral.create": {
      const veteranId = await resolveVeteranTarget(cr.targetId!);
      unwrap(await createReferral(actor, veteranId, payload, onCommit));
      return;
    }
    case "followUp.record": {
      const referral = await adminDb
        .collection("veterans").doc(cr.targetId!)
        .collection("encounters").doc(String(payload.referralEncounterId)).get();
      if (referral.data()?.followUpCompleted) {
        throw new Stale("That referral's follow-up has already been recorded.");
      }
      unwrap(await recordFollowUp(actor, cr.targetId!, payload, onCommit));
      return;
    }
    case "outcome.log": {
      const veteranId = await resolveVeteranTarget(cr.targetId!);
      unwrap(await logOutcome(actor, veteranId, payload, onCommit));
      return;
    }
    case "resource.create": {
      const built = buildResourceInput(null, after);
      if (!built.ok) throw new Blocked(`No longer valid: ${built.error}`);
      unwrap(await createResource(actor, built.input, onCommit));
      return;
    }
    case "resource.update": {
      const snap = await readDoc("resources", cr.targetId!);
      if (!snap) throw new Stale("The resource has been deleted.");
      const drifted = driftedFields(resourceSnapshot(snap.data()!), cr.changes);
      if (drifted.length > 0) throw new Stale(`Changed since proposed: ${drifted.join(", ")}.`);
      const built = buildResourceInput(snap.data()!, after);
      if (!built.ok) throw new Blocked(`No longer valid: ${built.error}`);
      unwrap(await editResource(actor, snap.id, built.input, onCommit));
      return;
    }
    case "transaction.create": {
      const built = buildTransactionInput(null, after);
      if (!built.ok) throw new Blocked(`No longer valid: ${built.error}`);
      unwrap(await saveTransaction(actor, null, built.input, onCommit));
      return;
    }
    case "transaction.update": {
      const snap = await readDoc("transactions", cr.targetId!);
      if (!snap) throw new Stale("The transaction has been deleted.");
      const drifted = driftedFields(transactionSnapshot(snap.data()!), cr.changes);
      if (drifted.length > 0) throw new Stale(`Changed since proposed: ${drifted.join(", ")}.`);
      const built = buildTransactionInput(snap.data()!, after);
      if (!built.ok) throw new Blocked(`No longer valid: ${built.error}`);
      unwrap(await saveTransaction(actor, snap.id, built.input, onCommit));
      return;
    }
    default:
      throw new Error(`${cr.kind} has no operation.`);
  }
}

type Writer = {
  set(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): unknown;
};

function decisionAudit(tx: Writer, id: string, actor: Actor, status: string, now: Date) {
  tx.set(adminDb.collection("auditLog").doc(), {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "update",
    resourceType: "changeRequest",
    resourceId: id,
    diff: { status: { before: "pending", after: status } },
    at: now,
  });
}

async function markStale(ref: FirebaseFirestore.DocumentReference, actor: Actor, message: string) {
  const now = new Date();
  const batch = adminDb.batch();
  batch.update(ref, {
    status: "stale",
    reviewedBy: actor.uid,
    reviewedByEmail: actor.email,
    reviewedAt: now,
    reviewNote: message,
  });
  decisionAudit(batch, ref.id, actor, "stale", now);
  await batch.commit();
}

/**
 * An admin's decision. `actor` must already be checked as an admin by the
 * caller. A stale request is never applied; a blocked one stays pending.
 */
export async function decideChange(
  id: string,
  decision: "approve" | "reject",
  actor: Actor,
  note?: string,
): Promise<DecideResult> {
  if (!id || id.includes("/")) return { ok: false, error: "Change request not found." };
  const ref = adminDb.collection(COLLECTION).doc(id);
  const reviewNote = note?.trim() || null;
  const decided = (now: Date) => ({
    reviewedBy: actor.uid,
    reviewedByEmail: actor.email,
    reviewedAt: now,
    reviewNote,
    lastError: null,
  });

  // Reject, and the field writes: one transaction each.
  const first = await adminDb.runTransaction(
    async (tx): Promise<DecideResult | { claimed: ChangeRequest }> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, error: "Change request not found." };
      const cr = deserialize(snap.id, snap.data()!);
      const now = new Date();
      // A claim nobody finished — the server died mid-approve. The change and
      // its approval commit together, so nothing was written: free to retry.
      const abandoned =
        cr.status === "applying" &&
        now.getTime() - (tsToDate(snap.data()!.claimedAt)?.getTime() ?? 0) > CLAIM_LEASE_MS;
      if (cr.status !== "pending" && !abandoned) {
        return { ok: false, error: cr.status === "applying" ? "It's saving right now." : `It's already ${cr.status}.` };
      }

      if (decision === "reject") {
        if (cr.status !== "pending") return { ok: false, error: "It's saving right now." };
        tx.update(ref, { status: "rejected", ...decided(now) });
        decisionAudit(tx, id, actor, "rejected", now);
        return { ok: true, status: "rejected", appliedId: null };
      }
      if (isExpired(cr.proposedAt, now)) {
        throw new Stale("It's more than a week old. Ask Claude to look again and re-propose.");
      }

      if (!FIELD_KINDS.has(cr.kind)) {
        // Claim it; the op runs outside this transaction.
        tx.update(ref, { status: "applying", claimedAt: now });
        return { claimed: cr };
      }

      const applied = await applyFields(tx, cr, actor, now);
      tx.update(ref, { status: "approved", appliedId: applied.appliedId, ...decided(now) });
      decisionAudit(tx, id, actor, "approved", now);
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
    },
  ).catch(async (err: unknown) => {
    if (err instanceof Stale) {
      await markStale(ref, actor, err.message);
      return { ok: false as const, status: "stale" as const, error: `${err.message} Marked out of date — nothing was changed.` };
    }
    if (err instanceof Blocked) {
      await ref.update({ lastError: err.message });
      return { ok: false as const, error: err.message };
    }
    throw err;
  });

  if (!("claimed" in first)) return first;

  // The operations: the app's own code, run as the approving admin, with the
  // approval written into the same commit.
  const cr = first.claimed;
  let appliedId: string | null = null;
  try {
    await applyOp(cr, actor, (batch, applied) => {
      const now = new Date();
      appliedId = applied.id;
      batch.update(ref, {
        status: "approved",
        appliedId: applied.id,
        result: applied.result ?? null,
        claimedAt: null,
        ...decided(now),
      });
      decisionAudit(batch, id, actor, "approved", now);
    });
    return { ok: true, status: "approved", appliedId };
  } catch (err) {
    // Something after the commit can still throw. If the approval landed, the
    // change did too — say so rather than offering to apply it again.
    const current = (await ref.get()).data();
    if (current?.status === "approved") {
      return { ok: true, status: "approved", appliedId: current.appliedId ?? null };
    }
    if (err instanceof Stale) {
      await markStale(ref, actor, err.message);
      return { ok: false, status: "stale", error: `${err.message} Marked out of date — nothing was changed.` };
    }
    // Nothing committed: safe to try again.
    const message = err instanceof Error ? err.message : String(err);
    await ref.update({ status: "pending", claimedAt: null, lastError: message });
    return { ok: false, error: err instanceof Blocked ? message : `Didn't save: ${message}` };
  }
}

/** Proposal order, with a new veteran ahead of anything proposed in the same
 *  millisecond — its intake and notes can't land before it. */
export function inApplyOrder(requests: ChangeRequest[]): ChangeRequest[] {
  const rank = (cr: ChangeRequest) => (cr.kind === "veteran.create" ? 0 : 1);
  return [...requests].sort(
    (a, b) => a.proposedAt.getTime() - b.proposedAt.getTime() || rank(a) - rank(b),
  );
}

/**
 * Approve exactly the requests the admin was shown for one call — by id, so
 * anything added to the call after the page loaded is never swept in. Refuses
 * if the call has changed since; stops at the first one that doesn't save, so
 * a referral never lands for a new veteran whose record didn't.
 */
export async function approveGroup(
  groupLabel: string,
  shownIds: string[],
  actor: Actor,
): Promise<{ approved: number; stoppedAt: { id: string; error: string } | null }> {
  const pending = (await listChangeRequests("pending", 500)).filter((cr) => cr.groupLabel === groupLabel);
  const shown = new Set(shownIds);
  if (pending.length !== shown.size || pending.some((cr) => !shown.has(cr.id))) {
    return {
      approved: 0,
      stoppedAt: { id: "", error: "This call changed since the page loaded. Refresh and check it again." },
    };
  }
  let approved = 0;
  for (const cr of inApplyOrder(pending)) {
    const r = await decideChange(cr.id, "approve", actor);
    if (!r.ok) return { approved, stoppedAt: { id: cr.id, error: r.error } };
    approved++;
  }
  return { approved, stoppedAt: null };
}

export { PENDING_PREFIX };
