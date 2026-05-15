import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Rate } from "@/lib/schemas";

const COLLECTION = "rateTable";

export async function getRate(rateCode: string): Promise<Rate | null> {
  const doc = await adminDb.collection(COLLECTION).doc(rateCode).get();
  if (!doc.exists) return null;
  return doc.data() as Rate;
}

export async function listRates(): Promise<Rate[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("monthlyAmount", "asc")
    .get();
  return snap.docs.map((d) => d.data() as Rate);
}
