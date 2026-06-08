"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getSession } from "@/lib/firebase/session";
import { encounterInputSchema, orgInputSchema } from "@/lib/schemas";

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

export async function createOrgAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = orgInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const doc = dropUndefined({
    ...input,
    assigneeUid: input.assigneeUid ?? null,
    primaryContactEmail: input.primaryContactEmail || undefined,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("orgs").add(doc);
  await logAudit({
    action: "create",
    resourceType: "org",
    resourceId: ref.id,
  });

  revalidatePath("/orgs");
  return { ok: true, id: ref.id };
}

export async function editOrgAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = orgInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const ref = adminDb.collection("orgs").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Organization not found." };
  const existing = snap.data()!;

  const now = new Date();
  const updates = dropUndefined({
    ...input,
    assigneeUid: input.assigneeUid ?? null,
    primaryContactEmail: input.primaryContactEmail || undefined,
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
    resourceType: "org",
    resourceId: id,
    diff,
  });

  revalidatePath(`/orgs/${id}`);
  revalidatePath("/orgs");
  return { ok: true, id };
}

export async function addOrgEncounterAction(
  orgId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = encounterInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const data = dropUndefined({
    ...input,
    nextStepDueAt: input.nextStepDueAt ?? null,
    loggedBy: session.uid,
    createdAt: now,
  });

  const encounterRef = await adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("encounters")
    .add(data);

  // Touch the org's updatedAt so it bumps to the top of the list view.
  await adminDb.collection("orgs").doc(orgId).update({
    updatedAt: now,
    updatedBy: session.uid,
  });

  await logAudit({
    action: "create",
    resourceType: "org_encounter",
    resourceId: `${orgId}/${encounterRef.id}`,
  });

  revalidatePath(`/orgs/${orgId}`);
  revalidatePath("/orgs");
  return { ok: true };
}
