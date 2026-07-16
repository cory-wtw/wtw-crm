"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import { vsoInputSchema } from "@/lib/schemas";

function dropUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
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
    .map(
      (i) =>
        `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`,
    )
    .join("; ");
}

export async function createVsoAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = vsoInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const doc = dropUndefined({
    ...input,
    partnershipStatus: input.partnershipStatus ?? "in_discussion",
    directEmail: input.directEmail || undefined,
    referralsMade: 0,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("vsos").add(doc);
  await logAudit({
    action: "create",
    resourceType: "vso",
    resourceId: ref.id,
  });
  revalidatePath("/vsos");
  return { ok: true, id: ref.id };
}

export async function editVsoAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = vsoInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const ref = adminDb.collection("vsos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "VSO not found." };
  const existing = snap.data()!;

  const now = new Date();
  const updates = dropUndefined({
    ...input,
    partnershipStatus: input.partnershipStatus ?? "in_discussion",
    directEmail: input.directEmail || undefined,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const diff = computeDiff(
    existing as Record<string, unknown>,
    input as unknown as Record<string, unknown>,
    Object.keys(input),
  );

  await ref.update(updates);
  await logAudit({
    action: "update",
    resourceType: "vso",
    resourceId: id,
    diff,
  });
  revalidatePath(`/vsos/${id}`);
  revalidatePath("/vsos");
  return { ok: true, id };
}
