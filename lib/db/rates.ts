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

/**
 * Load the most recent rate year as a rateCode -> monthlyAmount map, so
 * benefit dollars are always computed with the latest VA numbers. Returns an
 * empty map (year null) when the table hasn't been seeded.
 */
export async function loadCurrentRateAmounts(): Promise<{
  year: number | null;
  amounts: Map<string, number>;
}> {
  const rates = await listRates();
  if (rates.length === 0) return { year: null, amounts: new Map() };
  const year = Math.max(...rates.map((r) => r.rateYear));
  const amounts = new Map<string, number>();
  for (const r of rates) {
    if (r.rateYear === year) amounts.set(r.rateCode, r.monthlyAmount);
  }
  return { year, amounts };
}
