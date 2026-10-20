/**
 * One-time tidy of records saved before lib/tidy.ts ran on every save.
 * Server-only. Admin → Tidy data previews it, then applies it.
 */

import { adminDb } from "@/lib/firebase/admin";
import { tidyChanges, tidyResource, tidyVeteran } from "@/lib/tidy";

export type TidyRow = {
  collection: "veterans" | "resources";
  id: string;
  name: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};

export async function planTidy(): Promise<TidyRow[]> {
  const [veterans, resources] = await Promise.all([
    adminDb.collection("veterans").get(),
    adminDb.collection("resources").get(),
  ]);
  const rows: TidyRow[] = [];

  for (const doc of veterans.docs) {
    const data = doc.data();
    const changes = tidyChanges(data, tidyVeteran(data));
    if (Object.keys(changes).length === 0) continue;
    rows.push({
      collection: "veterans",
      id: doc.id,
      name: `${data.firstName ?? "?"} ${data.lastInitial ?? ""}`.trim(),
      changes,
    });
  }
  for (const doc of resources.docs) {
    const data = doc.data();
    const changes = tidyChanges(data, tidyResource(data));
    if (Object.keys(changes).length === 0) continue;
    rows.push({
      collection: "resources",
      id: doc.id,
      name: String(data.organizationName ?? "?"),
      changes,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Rebuilds the plan and writes it, with an audit entry per record. Each record
 * is re-read and re-tidied inside its own transaction, so an edit saved while
 * this ran is tidied as it now stands rather than overwritten by the preview.
 */
export async function applyTidy(actor: { uid: string; email: string }): Promise<number> {
  const rows = await planTidy();
  const now = new Date();
  let written = 0;
  for (const row of rows) {
    const ref = adminDb.collection(row.collection).doc(row.id);
    const wrote = await adminDb.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (!data) return false;
      const tidied = row.collection === "veterans" ? tidyVeteran(data) : tidyResource(data);
      const changes = tidyChanges(data, tidied);
      if (Object.keys(changes).length === 0) return false;
      tx.update(ref, {
        ...Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.after])),
        updatedBy: actor.uid,
        updatedAt: now,
      });
      tx.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: "update",
        resourceType: row.collection === "veterans" ? "veteran" : "resource",
        resourceId: row.id,
        diff: changes,
        at: now,
      });
      return true;
    });
    if (wrote) written++;
  }
  return written;
}
