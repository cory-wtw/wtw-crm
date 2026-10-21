/**
 * Loads what's on file for the likely-duplicate check. Server-only — shared by
 * the bank/Zeffy import action and scripts/import-qb-ledger.ts so the two can't
 * drift apart.
 */

import { adminDb } from "@/lib/firebase/admin";
import { placeForCity } from "@/lib/geo/counties";
import { TRANSACTIONS_COLLECTION as TRANSACTIONS } from "@/lib/schemas";
import {
  buildDedupeIndex,
  DEDUPE_FIELDS,
  dateRange,
  toExistingTransaction,
  type DedupeIndex,
} from "./dedupe";

/** A real city, from the nationwide ZIP data. */
const isCity = (words: string, state: string) => placeForCity(words, state) !== null;

/**
 * Every transaction within the duplicate window of these dates, optionally
 * leaving out one source (the QB script compares against everything but QB).
 */
export async function loadDedupeIndex(
  dates: readonly string[],
  options: { excludeSource?: string } = {},
): Promise<DedupeIndex> {
  const { from, to } = dateRange(dates);
  const snap = await adminDb
    .collection(TRANSACTIONS)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .select(...DEDUPE_FIELDS)
    .get();
  const existing = snap.docs
    .map((d) => toExistingTransaction(d.id, d.data()))
    .filter((t) => t.source !== options.excludeSource);
  return buildDedupeIndex(existing, isCity);
}
