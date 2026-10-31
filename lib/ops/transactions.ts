/**
 * Saving a transaction, minus the session check: the transaction form and
 * Claude's approved change requests both run this. Admin-only either way —
 * callers check canManageFinances first.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { CATEGORIES, TRANSACTIONS } from "@/lib/db/finance";
import { adminDb } from "@/lib/firebase/admin";
import { transactionInputSchema, type Category } from "@/lib/schemas";
import type { Actor, OnCommit } from "./actor";

type Result<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Like the other actions' dropUndefined, but also drops "" (blank form fields). */
function dropEmpty<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
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

function revalidateFinances() {
  revalidatePath("/finances", "layout");
}

export async function loadCategory(id: string): Promise<Category | null> {
  const snap = await adminDb.collection(CATEGORIES).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    type: d.type,
    defaultProgramPct: d.defaultProgramPct,
    defaultMgmtPct: d.defaultMgmtPct,
    defaultFundraisingPct: d.defaultFundraisingPct,
  };
}

export async function saveTransaction(
  actor: Actor,
  id: string | null,
  rawInput: unknown,
  onCommit?: OnCommit,
): Promise<Result> {
  const parsed = transactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;
  const category = await loadCategory(input.categoryId);
  if (!category) return { ok: false, error: "That category no longer exists." };
  if (category.type !== input.type) {
    return {
      ok: false,
      error: `"${category.name}" is an ${category.type} category.`,
    };
  }

  // Only an expense is spent on somebody, and only on a veteran who exists.
  const veteranId = input.type === "expense" ? input.veteranId || undefined : undefined;
  if (veteranId) {
    const veteran = await adminDb.collection("veterans").doc(veteranId).get();
    if (!veteran.exists) return { ok: false, error: "That veteran is no longer on the Roster." };
  }

  const now = new Date();
  // Income is never functionally allocated, and an allocation identical to
  // the category default is stored as "inherit" so later edits to the
  // default flow through.
  const allocation =
    input.type === "expense" &&
    input.allocation &&
    !(
      input.allocation.programPct === category.defaultProgramPct &&
      input.allocation.mgmtPct === category.defaultMgmtPct &&
      input.allocation.fundraisingPct === category.defaultFundraisingPct
    )
      ? input.allocation
      : undefined;
  const fields = {
    ...input,
    amount: Math.round(input.amount * 100) / 100,
    allocation,
    donorName: input.type === "income" ? input.donorName : undefined,
    campaign: input.type === "income" ? input.campaign : undefined,
    veteranId,
  };

  if (!id) {
    const ref = adminDb.collection(TRANSACTIONS).doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      ...dropEmpty(fields),
      source: "manual",
      createdBy: actor.uid,
      createdAt: now,
      updatedBy: actor.uid,
      updatedAt: now,
    });
    onCommit?.(batch, { id: ref.id });
    await batch.commit();
    await logAudit({
      action: "create",
      resourceType: "transaction",
      resourceId: ref.id,
    });
    revalidateFinances();
    if (veteranId) revalidatePath(`/veterans/${veteranId}`);
    return { ok: true, id: ref.id };
  }

  const ref = adminDb.collection(TRANSACTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Transaction not found." };
  const existing = snap.data()!;

  // Rewrite the whole document (minus provenance) so a cleared field
  // actually clears instead of lingering from the previous version.
  const batch = adminDb.batch();
  batch.set(ref, {
    ...dropEmpty(fields),
    source: existing.source ?? "manual",
    createdBy: existing.createdBy ?? actor.uid,
    createdAt: existing.createdAt ?? now,
    updatedBy: actor.uid,
    updatedAt: now,
  });
  onCommit?.(batch, { id: null });
  await batch.commit();
  await logAudit({
    action: "update",
    resourceType: "transaction",
    resourceId: id,
    diff: computeDiff(
      existing as Record<string, unknown>,
      fields as unknown as Record<string, unknown>,
      Object.keys(fields),
    ),
  });
  revalidateFinances();
  for (const v of new Set([veteranId, existing.veteranId as string | undefined])) {
    if (v) revalidatePath(`/veterans/${v}`);
  }
  return { ok: true, id };
}

