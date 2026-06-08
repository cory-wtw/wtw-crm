import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Encounter, TransactionType } from "@/lib/schemas";

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
    occurredAt: tsToDate(data.occurredAt) ?? new Date(),
    loggedBy: data.loggedBy ?? "",
    location: data.location ?? undefined,
    summary: data.summary ?? "",
    nextStep: data.nextStep ?? undefined,
    nextStepDueAt: tsToDate(data.nextStepDueAt),
    amount: typeof data.amount === "number" ? data.amount : undefined,
    transactionType: data.transactionType as TransactionType | undefined,
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

export async function listOrgEncounters(
  orgId: string,
): Promise<Encounter[]> {
  const snap = await adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("encounters")
    .orderBy("occurredAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}
