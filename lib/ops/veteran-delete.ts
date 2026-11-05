/**
 * Deleting and restoring a veteran, minus the session check.
 *
 * A delete is soft: it stamps deletedAt/deletedBy and leaves the record and
 * its timeline in place, so a slip of the thumb is one tap to undo from
 * Admin → Recently deleted. Every list and lookup skips a deleted veteran
 * (lib/db/veterans.ts).
 */

import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import type { Actor } from "./actor";

type Result = { ok: true } | { ok: false; error: string };

export async function softDeleteVeteran(
  actor: Actor,
  veteranId: string,
): Promise<Result> {
  const ref = adminDb.collection("veterans").doc(veteranId);
  const now = new Date();
  // A transaction, so two admins deleting at once log it once.
  const result = await adminDb.runTransaction<Result>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: "Veteran not found." };
    if (snap.data()!.deletedAt) {
      return { ok: false, error: "This veteran was already deleted." };
    }
    tx.update(ref, { deletedAt: now, deletedBy: actor.uid });
    return { ok: true };
  });
  if (!result.ok) return result;

  await logAudit({
    action: "delete",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: {
      deletedAt: { before: null, after: now },
      deletedBy: { before: null, after: actor.uid },
    },
  });
  return { ok: true };
}

export async function restoreVeteran(
  actor: Actor,
  veteranId: string,
): Promise<Result> {
  const ref = adminDb.collection("veterans").doc(veteranId);
  const result = await adminDb.runTransaction<
    { ok: false; error: string } | { ok: true; deletedAt: Date | null; deletedBy: string | null }
  >(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: "Veteran not found." };
    const data = snap.data()!;
    if (!data.deletedAt) return { ok: false, error: "This veteran isn't deleted." };
    tx.update(ref, {
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date(),
      updatedBy: actor.uid,
    });
    return { ok: true, deletedAt: tsToDate(data.deletedAt), deletedBy: data.deletedBy ?? null };
  });
  if (!result.ok) return result;

  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: {
      deletedAt: { before: result.deletedAt, after: null },
      deletedBy: { before: result.deletedBy, after: null },
    },
  });
  return { ok: true };
}

function tsToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}
