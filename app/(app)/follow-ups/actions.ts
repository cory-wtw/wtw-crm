"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getResourcesByIds } from "@/lib/db/resources";
import { listVerificationsForResource } from "@/lib/db/verifications";
import { adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import {
  resultForOutcome,
  shouldFlagForUnreachable,
  UNREACHABLE_WINDOW_DAYS,
} from "@/lib/follow-up";
import { canAccessCrm, canRecordFollowUp } from "@/lib/permissions";
import {
  derivedVerificationStatus,
  followUpOutcomeSchema,
  FOLLOW_UP_OUTCOME_LABELS,
  type FollowUpResult,
} from "@/lib/schemas";
import { stageVerification } from "@/lib/verifications";

const followUpInputSchema = z.object({
  /** The referral packet being closed out. */
  referralEncounterId: z.string().min(1),
  outcomes: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        outcome: followUpOutcomeSchema,
        note: z.string().optional(),
      }),
    )
    .min(1, "Record an outcome for at least one resource."),
});

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

export type FollowUpSummary = {
  /** Resources this follow-up moved to flagged, for the confirmation screen. */
  flagged: { resourceId: string; organizationName: string }[];
};

/**
 * Record what came of a referral packet.
 *
 * Everything lands in one batch: the follow-up encounter, one verifications
 * doc per resource, the veteran's concierge status, the completion stamp on
 * the original packet, and any resource this pushed to flagged. A half-written
 * follow-up would either leave a veteran stuck in the queue forever or flag a
 * resource with no record of why.
 */
export async function recordFollowUpAction(
  veteranId: string,
  rawInput: unknown,
): Promise<
  { ok: true; summary: FollowUpSummary } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false, error: "Your account doesn't have access to this." };
  }

  const parsed = followUpInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  // One answer per resource. A repeated id would otherwise stage two flag
  // transitions for the same record, each justified by the other's absence.
  const input = {
    ...parsed.data,
    outcomes: [
      ...new Map(parsed.data.outcomes.map((o) => [o.resourceId, o])).values(),
    ],
  };

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await veteranRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  const existing = snap.data()!;

  if (
    !canRecordFollowUp(session, { assigneeUid: existing.assigneeUid ?? null })
  ) {
    return {
      ok: false,
      error: "You can only record follow-ups for veterans assigned to you.",
    };
  }

  const referralRef = veteranRef
    .collection("encounters")
    .doc(input.referralEncounterId);
  const referralSnap = await referralRef.get();
  if (!referralSnap.exists) {
    return { ok: false, error: "That referral is no longer on the record." };
  }

  const now = new Date();

  // Names for the summary line and for anything this flags. Resources deleted
  // since the packet went out simply don't get a name.
  const resourceIds = input.outcomes.map((o) => o.resourceId);
  const resources = await getResourcesByIds(resourceIds);
  const byId = new Map(resources.map((r) => [r.id, r]));

  // The two-unreachables rule counts prior human outcomes, so read them before
  // deciding anything. Only unreachable reports can trip it.
  const priorsByResource = new Map(
    await Promise.all(
      input.outcomes
        .filter((o) => o.outcome === "unreachable")
        .map(
          async (o) =>
            [o.resourceId, await listVerificationsForResource(o.resourceId)] as const,
        ),
    ),
  );

  const batch = adminDb.batch();
  const encounterRef = veteranRef.collection("encounters").doc();
  const flagged: FollowUpSummary["flagged"] = [];

  for (const outcome of input.outcomes) {
    const resource = byId.get(outcome.resourceId);

    stageVerification(
      batch,
      {
        resourceId: outcome.resourceId,
        checkType: "humanOutcome",
        result: resultForOutcome(outcome.outcome),
        detail: `Follow-up two weeks on: ${FOLLOW_UP_OUTCOME_LABELS[
          outcome.outcome
        ].toLowerCase()}.${outcome.note ? ` Note: ${outcome.note}` : ""}`,
        checkedBy: session.uid,
        outcome: outcome.outcome,
      },
      now,
    );

    if (!resource) continue;

    const trips = shouldFlagForUnreachable({
      outcome: outcome.outcome,
      priorVerifications: priorsByResource.get(outcome.resourceId) ?? [],
      now,
    });
    if (!trips) continue;

    // Don't re-flag something already flagged or retired — the human queue
    // has it, and a second transition doc would say nothing new.
    const currentStatus = derivedVerificationStatus(
      resource.verificationStatus,
      resource.lastVerified,
      now,
    );
    if (currentStatus === "flagged" || currentStatus === "retired") continue;

    const reason = `Two veterans couldn't reach them within ${UNREACHABLE_WINDOW_DAYS} days.`;
    batch.update(adminDb.collection("resources").doc(outcome.resourceId), {
      verificationStatus: "flagged",
      flagReason: reason,
      updatedBy: session.uid,
      updatedAt: now,
    });

    // The §7.4 invariant: no resource sits in flagged without a doc saying who
    // flagged it and why. This is that doc, and it commits with the change.
    stageVerification(
      batch,
      {
        resourceId: outcome.resourceId,
        checkType: "humanOutcome",
        result: "flag",
        detail: `Status changed from ${currentStatus} to flagged. ${reason}`,
        checkedBy: session.uid,
      },
      now,
    );

    flagged.push({
      resourceId: outcome.resourceId,
      organizationName: resource.organizationName,
    });
  }

  const outcomes: FollowUpResult[] = input.outcomes.map((o) => ({
    resourceId: o.resourceId,
    outcome: o.outcome,
    ...(o.note ? { note: o.note } : {}),
  }));

  batch.set(encounterRef, {
    type: "followUp",
    occurredAt: now,
    loggedBy: session.uid,
    summary: input.outcomes
      .map(
        (o) =>
          `${byId.get(o.resourceId)?.organizationName ?? o.resourceId}: ${FOLLOW_UP_OUTCOME_LABELS[o.outcome].toLowerCase()}`,
      )
      .join("; "),
    outcomes,
    createdAt: now,
  });

  batch.update(referralRef, { followUpCompleted: now });

  batch.update(veteranRef, {
    conciergeStatus: "closed",
    followUpDue: null,
    updatedBy: session.uid,
    updatedAt: now,
  });

  await batch.commit();

  await logAudit({
    action: "create",
    resourceType: "encounter",
    resourceId: `${veteranId}/${encounterRef.id}`,
    diff: {
      outcomes: {
        before: null,
        after: outcomes.map((o) => `${o.resourceId}: ${o.outcome}`),
      },
    },
  });

  revalidatePath("/follow-ups");
  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/veterans");

  return { ok: true, summary: { flagged } };
}
