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

/** Rebuilds the plan and writes it, with an audit entry per record. */
export async function applyTidy(actor: { uid: string; email: string }): Promise<number> {
  const rows = await planTidy();
  const now = new Date();
  for (let i = 0; i < rows.length; i += 200) {
    const batch = adminDb.batch();
    for (const row of rows.slice(i, i + 200)) {
      const updates = Object.fromEntries(
        Object.entries(row.changes).map(([k, c]) => [k, c.after]),
      );
      batch.update(adminDb.collection(row.collection).doc(row.id), {
        ...updates,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      batch.set(adminDb.collection("auditLog").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: "update",
        resourceType: row.collection === "veterans" ? "veteran" : "resource",
        resourceId: row.id,
        diff: row.changes,
        at: now,
      });
    }
    await batch.commit();
  }
  return rows.length;
}
