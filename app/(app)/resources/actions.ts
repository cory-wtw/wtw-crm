"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import {
  derivedVerificationStatus,
  resourceInputSchema,
  resultForStatus,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/schemas";
import { stageVerification } from "@/lib/verifications";

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

export async function createResourceAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = resourceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const now = new Date();
  const doc = dropUndefined({
    ...input,
    contactEmail: input.contactEmail || undefined,
    // Entering a record by hand IS the verification — the person typing it
    // just confirmed it exists. Imported records are stamped separately and
    // land as "flagged" for review; they never come through this path.
    lastVerified: now,
    lastVerifiedBy: session.uid,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = adminDb.collection("resources").doc();
  const batch = adminDb.batch();
  batch.set(ref, doc);

  // Log the status the record was entered at. A record can only reach
  // `flagged` through a human decision or a Phase 7 check, and either way the
  // decision has to be on the record — so it commits in the same batch.
  const result = resultForStatus(input.verificationStatus);
  if (result) {
    stageVerification(
      batch,
      {
        resourceId: ref.id,
        checkType: "manual",
        result,
        detail: `Entered by hand as ${VERIFICATION_STATUS_LABELS[input.verificationStatus].toLowerCase()}.`,
        checkedBy: session.uid,
      },
      now,
    );
  }

  await batch.commit();

  await logAudit({
    action: "create",
    resourceType: "resource",
    resourceId: ref.id,
  });
  revalidatePath("/resources");
  return { ok: true, id: ref.id };
}

export async function editResourceAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };

  const parsed = resourceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const ref = adminDb.collection("resources").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Resource not found." };
  const existing = snap.data()!;

  const now = new Date();

  // Re-stamp verification only on a transition INTO live — that's a human
  // confirming a flagged or aging record is good. Editing a phone number on an
  // already-live record must not reset the freshness clock, or nothing ever
  // ages and the whole verification tier goes quiet.
  //
  // Compare against the DERIVED status, not the stored one: a record stored as
  // "live" but 90 days stale reads as "aging" everywhere, including in the form
  // the user just submitted. Comparing against the raw stored value would treat
  // "aging -> live" as a no-op and quietly refuse to refresh the very records
  // that need refreshing.
  const existingLastVerified =
    existing.lastVerified?.toDate?.() ?? existing.lastVerified ?? null;
  const existingStatus = derivedVerificationStatus(
    existing.verificationStatus ?? "live",
    existingLastVerified,
  );
  const becameLive =
    input.verificationStatus === "live" && existingStatus !== "live";

  const updates = dropUndefined({
    ...input,
    contactEmail: input.contactEmail || undefined,
    ...(becameLive
      ? { lastVerified: now, lastVerifiedBy: session.uid, flagReason: null }
      : {}),
    updatedBy: session.uid,
    updatedAt: now,
  });

  const diff = computeDiff(
    existing as Record<string, unknown>,
    input as unknown as Record<string, unknown>,
    Object.keys(input),
  );

  const batch = adminDb.batch();
  batch.update(ref, updates);

  // Any human decision that moves the status — into flagged, into retired, or
  // back into live — is a verification event and commits with the change it
  // justifies. `aging` is excluded because nobody decides it: it's derived from
  // lastVerified at read time, so there's no check to log.
  const result =
    input.verificationStatus !== existingStatus
      ? resultForStatus(input.verificationStatus)
      : null;
  if (result) {
    stageVerification(
      batch,
      {
        resourceId: id,
        checkType: "manual",
        result,
        detail: `Status changed from ${VERIFICATION_STATUS_LABELS[existingStatus].toLowerCase()} to ${VERIFICATION_STATUS_LABELS[input.verificationStatus].toLowerCase()} from the resource form.`,
        checkedBy: session.uid,
      },
      now,
    );
  }

  await batch.commit();

  await logAudit({
    action: "update",
    resourceType: "resource",
    resourceId: id,
    diff,
  });
  revalidatePath(`/resources/${id}`);
  revalidatePath("/resources");
  return { ok: true, id };
}
