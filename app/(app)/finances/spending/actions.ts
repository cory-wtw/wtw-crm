"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { VENDOR_ALIASES } from "@/lib/db/finance";
import { adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";

const schema = z.object({
  keys: z.array(z.string().min(1).max(200)).min(1).max(50),
  /** Blank = drop the custom name and go back to what the bank says. */
  name: z.string().trim().max(100),
});

/**
 * Rename a vendor, or merge it into another by giving it that vendor's name.
 * Applies to every raw key currently folded into the vendor, so future
 * imports with the same bank text land under the chosen name too.
 */
export async function setVendorNameAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageFinances(session))
    return { ok: false, error: "Only admins can manage finances." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Couldn't read that name." };
  const { keys, name } = parsed.data;

  const batch = adminDb.batch();
  for (const key of keys) {
    // Hash the key for the doc id: keys can contain characters Firestore ids can't.
    const id = createHash("sha1").update(key).digest("hex").slice(0, 24);
    const ref = adminDb.collection(VENDOR_ALIASES).doc(id);
    if (name) batch.set(ref, { key, name, updatedBy: session.uid, updatedAt: new Date() });
    else batch.delete(ref);
  }
  await batch.commit();
  await logAudit({
    action: name ? "update" : "delete",
    resourceType: "vendorAlias",
    resourceId: keys.join(", ").slice(0, 200),
    diff: { name: { before: null, after: name || null } },
  });
  revalidatePath("/finances/spending");
  return { ok: true };
}
