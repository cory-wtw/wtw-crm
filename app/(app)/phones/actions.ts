"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getSession } from "@/lib/firebase/session";
import { phoneInputSchema } from "@/lib/schemas";

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

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (session.role !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }
  return { ok: true as const, session };
}

export async function createPhoneAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = phoneInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const doc = dropUndefined({
    ...input,
    status: input.status ?? "available",
    assignedVeteranId: null,
    dateAssigned: null,
    dateReturned: null,
    createdBy: guard.session.uid,
    createdAt: now,
    updatedBy: guard.session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("phones").add(doc);
  await logAudit({
    action: "create",
    resourceType: "phone",
    resourceId: ref.id,
  });
  revalidatePath("/phones");
  return { ok: true, id: ref.id };
}

export async function editPhoneAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = phoneInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const ref = adminDb.collection("phones").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Phone not found." };
  const existing = snap.data()!;

  const now = new Date();
  const updates = dropUndefined({
    ...input,
    status: input.status ?? "available",
    updatedBy: guard.session.uid,
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
    resourceType: "phone",
    resourceId: id,
    diff,
  });
  revalidatePath(`/phones/${id}`);
  revalidatePath("/phones");
  return { ok: true, id };
}
