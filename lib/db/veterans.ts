import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
  PipelineHistoryEntry,
  PipelineStage,
  Veteran,
} from "@/lib/schemas";

const COLLECTION = "veterans";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(id: string, data: FirebaseFirestore.DocumentData): Veteran {
  const history = (data.pipelineHistory ?? []) as Array<{
    stage: PipelineStage;
    enteredAt: unknown;
    byUid: string;
  }>;

  return {
    id,
    firstName: data.firstName ?? "",
    lastInitial: data.lastInitial ?? "",
    preferredContact: data.preferredContact ?? "phone",
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    birthYear: data.birthYear ?? undefined,
    city: data.city ?? undefined,
    state: data.state ?? undefined,
    assigneeUid: data.assigneeUid ?? null,
    pipelineStage: data.pipelineStage ?? "found",
    pipelineHistory: history.map(
      (h): PipelineHistoryEntry => ({
        stage: h.stage,
        enteredAt: tsToDate(h.enteredAt) ?? new Date(0),
        byUid: h.byUid,
      }),
    ),
    dateFound: tsToDate(data.dateFound),
    dateConnected: tsToDate(data.dateConnected),
    dateFiled: tsToDate(data.dateFiled),
    dateWon: tsToDate(data.dateWon),
    dateLost: tsToDate(data.dateLost),
    monthlyBenefitBefore: data.monthlyBenefitBefore ?? 0,
    monthlyBenefitAfter: data.monthlyBenefitAfter ?? 0,
    vsoIds: data.vsoIds ?? [],
    assignedPhoneId: data.assignedPhoneId ?? null,
    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

export type VeteranListItem = {
  id: string;
  firstName: string;
  lastInitial: string;
  pipelineStage: PipelineStage;
  assigneeUid: string | null;
  dateFound: string | null;
  updatedAt: string;
  monthlyBenefitAfter: number;
};

export async function listVeterans(): Promise<Veteran[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getVeteran(id: string): Promise<Veteran | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}

/** Veterans currently linked to a given VSO. */
export async function listVeteransByVsoId(
  vsoId: string,
): Promise<Veteran[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("vsoIds", "array-contains", vsoId)
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

/** Veterans currently holding a given phone. Should be 0 or 1; returns
 * whatever Firestore has so admins can spot drift. */
export async function listVeteransByPhoneId(
  phoneId: string,
): Promise<Veteran[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("assignedPhoneId", "==", phoneId)
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

/** Stage counts for the dashboard, keyed by stage. */
export async function countVeteransByStage(): Promise<
  Record<PipelineStage, number>
> {
  const veterans = await listVeterans();
  const counts: Record<PipelineStage, number> = {
    found: 0,
    connected: 0,
    filed: 0,
    won: 0,
    lost: 0,
  };
  for (const v of veterans) counts[v.pipelineStage]++;
  return counts;
}
