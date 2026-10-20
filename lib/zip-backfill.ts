/**
 * ZIP backfill for veterans entered with a city and no ZIP. Server-only.
 *
 * Shared by the admin page (Admin → Fill in ZIPs) and
 * scripts/infer-veteran-zips.ts, so the phone and the laptop can't disagree.
 * The plan is recomputed on apply rather than trusting what the browser saw.
 */

import { zipRows } from "@/lib/geo/counties";
import { adminDb } from "@/lib/firebase/admin";
import { buildZipIndex, inferZip, type ZipIndex } from "@/lib/zip-infer";

export type ZipPlanRow = {
  id: string;
  name: string;
  from: string;
  zip: string;
  note: string;
};

export type ZipUnresolvedRow = {
  id: string;
  name: string;
  from: string;
  reason: string;
};

export type ZipPlan = {
  total: number;
  alreadyHad: number;
  inferred: ZipPlanRow[];
  unresolved: ZipUnresolvedRow[];
};

let index: ZipIndex | null = null;
function zipIndex(): ZipIndex {
  index ??= buildZipIndex(zipRows());
  return index;
}

export async function planZipBackfill(): Promise<ZipPlan> {
  const snap = await adminDb.collection("veterans").get();
  const plan: ZipPlan = {
    total: snap.size,
    alreadyHad: 0,
    inferred: [],
    unresolved: [],
  };

  for (const doc of snap.docs) {
    const v = doc.data();
    const name = `${v.firstName ?? "?"} ${v.lastInitial ?? ""}`.trim();
    if (typeof v.zip === "string" && v.zip.trim()) {
      plan.alreadyHad++;
      continue;
    }
    const from =
      [v.city, v.state].filter(Boolean).join(", ") || "No city or state";
    const result = inferZip(zipIndex(), { city: v.city, state: v.state });
    if (!result.ok) {
      plan.unresolved.push({ id: doc.id, name, from, reason: result.reason });
      continue;
    }
    plan.inferred.push({
      id: doc.id,
      name,
      from,
      zip: result.zip,
      note:
        result.candidates > 1
          ? `${result.matchedCity}, ${result.state} — central of ${result.candidates} ZIPs`
          : `${result.matchedCity}, ${result.state}`,
    });
  }

  plan.inferred.sort((a, b) => a.name.localeCompare(b.name));
  plan.unresolved.sort((a, b) => a.name.localeCompare(b.name));
  return plan;
}

/**
 * Write the inferred ZIPs, each with an audit entry. Never overwrites a ZIP:
 * the plan only contains veterans without one, and it's rebuilt here.
 */
export async function applyZipBackfill(actor: {
  uid: string;
  email: string;
}): Promise<number> {
  const { inferred } = await planZipBackfill();
  const now = new Date();
  // Batches cap at 500 writes; each veteran is two (record + audit entry).
  for (let i = 0; i < inferred.length; i += 200) {
    const batch = adminDb.batch();
    for (const r of inferred.slice(i, i + 200)) {
      batch.update(adminDb.collection("veterans").doc(r.id), {
        zip: r.zip,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      batch.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: "update",
        resourceType: "veteran",
        resourceId: r.id,
        diff: { zip: { before: null, after: r.zip } },
        at: now,
      });
    }
    await batch.commit();
  }
  return inferred.length;
}
