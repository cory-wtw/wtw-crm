"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { VENDOR_ALIASES, VENDOR_MONTHLY } from "@/lib/db/finance";
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

const monthlySchema = z.object({
  /** The vendor's raw keys, so the amount survives renames and merges. */
  keys: z.array(z.string().min(1).max(200)).min(1).max(50),
  name: z.string().trim().min(1).max(100),
  /** null clears it and goes back to the estimate from recent charges. */
  monthly: z.number().finite().min(0).max(1_000_000).nullable(),
});

/** Set (or clear) what a recurring bill costs per month, e.g. a contractor's new rate. */
export async function setVendorMonthlyAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageFinances(session))
    return { ok: false, error: "Only admins can manage finances." };

  const parsed = monthlySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter an amount in dollars." };
  const { keys, name, monthly } = parsed.data;
  const batch = adminDb.batch();
  for (const key of keys) {
    const ref = adminDb.collection(VENDOR_MONTHLY).doc(createHash("sha1").update(key).digest("hex").slice(0, 24));
    if (monthly == null) batch.delete(ref);
    else batch.set(ref, { key, name, monthly: Math.round(monthly * 100) / 100, updatedBy: session.uid, updatedAt: new Date() });
  }
  await batch.commit();
  await logAudit({
    action: monthly == null ? "delete" : "update",
    resourceType: "vendorMonthly",
    resourceId: name.slice(0, 200),
    diff: { monthly: { before: null, after: monthly } },
  });
  revalidatePath("/finances/spending");
  return { ok: true };
}
