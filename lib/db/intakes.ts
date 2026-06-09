import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
  HearingFrequency,
  HousingSituation,
  Intake,
  IntakeBranch,
  IntakeStatus,
  SkinFrequency,
  StandardFrequency,
} from "@/lib/schemas";

const PARENT = "veterans";

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(
  id: string,
  veteranId: string,
  data: FirebaseFirestore.DocumentData,
): Intake {
  return {
    id,
    veteranId,
    liaisonUid: data.liaisonUid ?? "",
    status: (data.status ?? "draft") as IntakeStatus,
    completedAt: tsToDate(data.completedAt),
    basics: data.basics ?? {},
    service: {
      branches: (data.service?.branches ?? []) as IntakeBranch[],
      yearsServed: data.service?.yearsServed,
      rankAtDischarge: data.service?.rankAtDischarge,
      mos: data.service?.mos,
      dischargeStatus: data.service?.dischargeStatus,
      placesServed: data.service?.placesServed,
      combatExperience: data.service?.combatExperience,
      proudOf: data.service?.proudOf,
    },
    bodyDuringService: data.bodyDuringService ?? {},
    bodyToday: {
      headBrainMemory: (data.bodyToday?.headBrainMemory ??
        null) as StandardFrequency | null,
      vision: (data.bodyToday?.vision ?? null) as StandardFrequency | null,
      backNeckSpine: (data.bodyToday?.backNeckSpine ??
        null) as StandardFrequency | null,
      breathing: (data.bodyToday?.breathing ??
        null) as StandardFrequency | null,
      kneesAnklesFeet: (data.bodyToday?.kneesAnklesFeet ??
        null) as StandardFrequency | null,
      stomach: (data.bodyToday?.stomach ?? null) as StandardFrequency | null,
      shoulders: (data.bodyToday?.shoulders ??
        null) as StandardFrequency | null,
      skin: (data.bodyToday?.skin ?? null) as SkinFrequency | null,
      hearing: (data.bodyToday?.hearing ?? null) as HearingFrequency | null,
      other: data.bodyToday?.other,
      dailyLifeImpact: data.bodyToday?.dailyLifeImpact,
    },
    sleep: data.sleep ?? [],
    mentalHealth: data.mentalHealth ?? [],
    coping: data.coping ?? [],
    housing: (data.housing ?? null) as HousingSituation | null,
    housingOther: data.housingOther,
    income: data.income ?? [],
    vaCare: data.vaCare ?? {},
    openQuestions: data.openQuestions ?? {},
    documents: data.documents ?? {
      dd214: { status: null },
      serviceMedicalRecords: { status: null },
      vaCFile: { status: null },
      priorVADecisionLetters: { status: null },
      civilianMedicalRecords: { status: null },
      marriageDivorceDocs: { status: null },
      photoIdSsn: { status: null },
      awardsCitationsOrders: { status: null },
    },
    buddyContacts: data.buddyContacts ?? [],
    vsoBestFit: data.vsoBestFit ?? { types: [] },
    liaisonHandoff: data.liaisonHandoff ?? {},
    nextContact: data.nextContact ?? {},
    liaisonSignature: {
      name: data.liaisonSignature?.name,
      signedAt: tsToDate(data.liaisonSignature?.signedAt),
    },
    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

export async function listIntakes(veteranId: string): Promise<Intake[]> {
  const snap = await adminDb
    .collection(PARENT)
    .doc(veteranId)
    .collection("intakes")
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, veteranId, d.data()));
}

export async function getIntake(
  veteranId: string,
  intakeId: string,
): Promise<Intake | null> {
  const doc = await adminDb
    .collection(PARENT)
    .doc(veteranId)
    .collection("intakes")
    .doc(intakeId)
    .get();
  if (!doc.exists) return null;
  return deserialize(doc.id, veteranId, doc.data()!);
}
