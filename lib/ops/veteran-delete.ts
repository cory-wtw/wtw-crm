/**
 * Deleting and restoring a veteran, minus the session check.
 *
 * A delete is soft: it stamps deletedAt/deletedBy and leaves the record and
 * its timeline in place, so a slip of the thumb is one tap to undo from
 * Admin → Recently deleted. Every list and lookup skips a deleted veteran
 * (lib/db/veterans.ts).
 */

import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import type { Actor } from "./actor";

type Result = { ok: true } | { ok: false; error: string };

export async function softDeleteVeteran(
  actor: Actor,
  veteranId: string,
): Promise<Result> {
  const ref = adminDb.collection("veterans").doc(veteranId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  if (snap.data()!.deletedAt) {
    return { ok: false, error: "This veteran was already deleted." };
  }

  const now = new Date();
  await ref.update({ deletedAt: now, deletedBy: actor.uid });
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
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  const data = snap.data()!;
  if (!data.deletedAt) return { ok: false, error: "This veteran isn't deleted." };

  await ref.update({
    deletedAt: null,
    deletedBy: null,
    updatedAt: new Date(),
    updatedBy: actor.uid,
  });
  await logAudit({
    action: "update",
    resourceType: "veteran",
    resourceId: veteranId,
    diff: {
      deletedAt: { before: data.deletedAt, after: null },
      deletedBy: { before: data.deletedBy ?? null, after: null },
    },
  });
  return { ok: true };
}
