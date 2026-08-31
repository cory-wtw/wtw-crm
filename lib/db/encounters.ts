import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Encounter } from "@/lib/schemas";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Encounter {
  return {
    id,
    // Encounters written before referrals existed are plain notes.
    type: data.type ?? "note",
    occurredAt: tsToDate(data.occurredAt) ?? new Date(),
    loggedBy: data.loggedBy ?? "",
    location: data.location ?? undefined,
    summary: data.summary ?? "",
    nextStep: data.nextStep ?? undefined,
    nextStepDueAt: tsToDate(data.nextStepDueAt),
    bucketsIdentified: data.bucketsIdentified ?? [],
    intakeAnswers: data.intakeAnswers ?? {},
    bucketsMatched: data.bucketsMatched ?? null,
    candidatesFound:
      typeof data.candidatesFound === "number" ? data.candidatesFound : null,
    referrals: data.referrals ?? [],
    followUpDue: tsToDate(data.followUpDue),
    followUpCompleted: tsToDate(data.followUpCompleted),
    outcomes: data.outcomes ?? [],
    createdAt: tsToDate(data.createdAt) ?? new Date(),
  };
}

export async function listEncounters(
  veteranId: string,
): Promise<Encounter[]> {
  const snap = await adminDb
    .collection("veterans")
    .doc(veteranId)
    .collection("encounters")
    .orderBy("occurredAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

/**
 * The most recent intake run, if there is one.
 *
 * Seeds the needs checkboxes when staff opens intake again — a call that ended
 * with nothing to refer to shouldn't cost them the assessment.
 */
export async function getLatestIntake(
  veteranId: string,
): Promise<Encounter | null> {
  const encounters = await listEncounters(veteranId);
  return encounters.find((e) => e.type === "intake") ?? null;
}

/** The most recent referral packet sent to a veteran, if there is one. */
export async function getLatestReferral(
  veteranId: string,
): Promise<Encounter | null> {
  const encounters = await listEncounters(veteranId);
  return encounters.find((e) => e.type === "referral") ?? null;
}
