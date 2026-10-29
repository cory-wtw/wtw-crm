"use server";

import { adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { recordFollowUp, type FollowUpSummary } from "@/lib/ops/follow-up";
import { canAccessCrm, canRecordFollowUp } from "@/lib/permissions";

export type { FollowUpSummary } from "@/lib/ops/follow-up";

/** Record what came of a referral packet. The work is in lib/ops/follow-up.ts. */
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

  const snap = await adminDb.collection("veterans").doc(veteranId).get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  if (
    !canRecordFollowUp(session, { assigneeUid: snap.data()!.assigneeUid ?? null })
  ) {
    return {
      ok: false,
      error: "Your account can't record follow-ups.",
    };
  }

  return recordFollowUp(session, veteranId, rawInput);
}
