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
  /** Set when the record had no state and the city did ("Rossville, GA"). */
  state?: string;
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
      ...(typeof v.state === "string" && v.state.trim() ? {} : { state: result.state }),
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
 * Write the inferred ZIPs, each with an audit entry. One transaction per
 * veteran that re-reads the record first, so a real ZIP saved by staff while
 * this ran is never overwritten by a guess.
 */
export async function applyZipBackfill(actor: {
  uid: string;
  email: string;
}): Promise<number> {
  const { inferred } = await planZipBackfill();
  const now = new Date();
  let written = 0;
  for (const r of inferred) {
    const ref = adminDb.collection("veterans").doc(r.id);
    const wrote = await adminDb.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!current || (typeof current.zip === "string" && current.zip.trim())) {
        return false;
      }
      const setState = r.state && !(typeof current.state === "string" && current.state.trim());
      tx.update(ref, {
        zip: r.zip,
        ...(setState ? { state: r.state } : {}),
        updatedBy: actor.uid,
        updatedAt: now,
      });
      tx.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: "update",
        resourceType: "veteran",
        resourceId: r.id,
        diff: {
          zip: { before: null, after: r.zip },
          ...(setState ? { state: { before: null, after: r.state } } : {}),
        },
        at: now,
      });
      return true;
    });
    if (wrote) written++;
  }
  return written;
}
