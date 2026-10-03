"use server";

import { revalidatePath } from "next/cache";
import { Timestamp } from "firebase-admin/firestore";
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

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/** Later of the two, treating a null contact date as "never". */
function maxDate(a: Date | null, b: Date): Date {
  return a && a > b ? a : b;
}

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
  const referralRef = veteranRef
    .collection("encounters")
    .doc(input.referralEncounterId);

  // Names for the summary line and for anything this flags. Resources deleted
  // since the packet went out simply don't get a name. Read up front, outside
  // the transaction: they don't decide whether this follow-up may be written.
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

  const outcomes: FollowUpResult[] = input.outcomes.map((o) => ({
    resourceId: o.resourceId,
    outcome: o.outcome,
    ...(o.note ? { note: o.note } : {}),
  }));

  const now = new Date();
  const encounterRef = veteranRef.collection("encounters").doc();
  const flagged: FollowUpSummary["flagged"] = [];

  // A transaction, not a batch: the referral's followUpCompleted stamp is the
  // only thing stopping a double-submit from recording the same follow-up
  // twice — and a second "unreachable" from the same call would trip the
  // two-reports rule and flag a resource on one veteran's word.
  const refusal = await adminDb.runTransaction(async (tx) => {
    flagged.length = 0;
    const [snap, referralSnap] = await Promise.all([
      tx.get(veteranRef),
      tx.get(referralRef),
    ]);
    if (!snap.exists) return "Veteran not found.";
    const existing = snap.data()!;

    if (
      !canRecordFollowUp(session, {
        assigneeUid: existing.assigneeUid ?? null,
      })
    ) {
      return "You can only record follow-ups for veterans assigned to you.";
    }

    const referral = referralSnap.data();
    if (!referralSnap.exists || referral?.type !== "referral") {
      return "That referral is no longer on the record.";
    }
    if (referral.followUpCompleted) {
      return "This follow-up has already been recorded.";
    }
    // Outcomes only for what the packet actually sent — otherwise a follow-up
    // could log verifications against (and flag) any resource at all.
    const referred = new Set(
      ((referral.referrals ?? []) as { resourceId: string }[]).map(
        (r) => r.resourceId,
      ),
    );
    if (input.outcomes.some((o) => !referred.has(o.resourceId))) {
      return "Those outcomes don't match the resources in this referral.";
    }

    for (const outcome of input.outcomes) {
      const resource = byId.get(outcome.resourceId);

      stageVerification(
        tx,
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
      tx.update(adminDb.collection("resources").doc(outcome.resourceId), {
        verificationStatus: "flagged",
        flagReason: reason,
        updatedBy: session.uid,
        updatedAt: now,
      });

      // The §7.4 invariant: no resource sits in flagged without a doc saying
      // who flagged it and why. This is that doc, and it commits with the
      // change.
      stageVerification(
        tx,
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

    tx.set(encounterRef, {
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

    tx.update(referralRef, { followUpCompleted: now });

    tx.update(veteranRef, {
      conciergeStatus: "closed",
      followUpDue: null,
      lastContactedAt: maxDate(tsToDate(existing.lastContactedAt), now),
      updatedBy: session.uid,
      updatedAt: now,
    });
    return null;
  });
  if (refusal) return { ok: false, error: refusal };

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

  revalidatePath("/outreach");
  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/veterans");

  return { ok: true, summary: { flagged } };
}
