/**
 * Logging a win, minus the session check: the veteran page and Claude's
 * approved change requests both run this.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { outcomeInputSchema, outcomeAmounts, outcomeSummary } from "@/lib/schemas";
import type { Actor, OnCommit } from "./actor";

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map((i) => `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`)
    .join("; ");
}

/**
 * Record a win — a job, housing, SNAP — on the veteran and on their timeline.
 *
 * The win lives on the veteran doc so the Impact report can count it from the
 * same read it already makes; the encounter is there so the timeline still
 * tells the whole story. Both commit together.
 */
export async function logOutcome(
  actor: Actor,
  veteranId: string,
  rawInput: unknown,
  onCommit?: OnCommit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = outcomeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await veteranRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };

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
    loggedBy: actor.uid,
    loggedAt: now,
  });

  const batch = adminDb.batch();
  const encounterRef = veteranRef.collection("encounters").doc();
  batch.set(encounterRef, {
    type: "outcome",
    occurredAt: input.achievedAt,
    loggedBy: actor.uid,
    summary: outcomeSummary({ ...outcome, kind: input.kind }),
    createdAt: now,
  });
  batch.update(veteranRef, {
    outcomes: FieldValue.arrayUnion(outcome),
    updatedAt: now,
    updatedBy: actor.uid,
  });
  onCommit?.(batch, { id: outcome.id as string });
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

