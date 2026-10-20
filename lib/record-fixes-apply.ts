/**
 * Applies lib/record-fixes.ts. Server-only.
 *
 * One transaction per record that re-reads it first and writes only the fields
 * still holding the value the preview showed — an edit made in between wins.
 * Retiring writes a verifications entry alongside, like the resource form.
 */

import { adminDb } from "@/lib/firebase/admin";
import { listResources } from "@/lib/db/resources";
import { planRecordFixes, type RecordFix } from "@/lib/record-fixes";

/** Missing, null and [] all mean "not set" — the reader defaults them. */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? null : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export async function planFixes(): Promise<RecordFix[]> {
  return planRecordFixes(await listResources());
}

export async function applyFixes(actor: { uid: string; email: string }): Promise<number> {
  const fixes = await planFixes();
  const now = new Date();
  let written = 0;

  for (const f of fixes) {
    const ref = adminDb.collection("resources").doc(f.id);
    const wrote = await adminDb.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (!data) return false;

      const updates: Record<string, unknown> = {};
      const diff: Record<string, { before: unknown; after: unknown }> = {};
      for (const [field, change] of Object.entries(f.changes)) {
        if (field === "verificationStatus") {
          // The preview shows the derived status ("aging" for a stale "live"),
          // so compare on intent: anything not already retired gets retired.
          if (data.verificationStatus === "retired") continue;
        } else if (!sameValue(data[field], change.before)) {
          continue;
        }
        updates[field] = change.after;
        diff[field] = change;
      }
      if (Object.keys(updates).length === 0) return false;

      tx.update(ref, { ...updates, updatedBy: actor.uid, updatedAt: now });
      tx.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: "update",
        resourceType: "resource",
        resourceId: f.id,
        diff,
        at: now,
      });
      if (updates.verificationStatus === "retired") {
        tx.set(adminDb.collection("verifications").doc(), {
          resourceId: f.id,
          checkType: "manual",
          result: "fail",
          detail: `Retired from Admin → Record fixes: ${f.reasons.join("; ")}.`,
          checkedAt: now,
          checkedBy: actor.uid,
        });
      }
      return true;
    });
    if (wrote) written++;
  }
  return written;
}
