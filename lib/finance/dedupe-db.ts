/**
 * Loads what's on file for the likely-duplicate check. Server-only — shared by
 * the bank/Zeffy import action and scripts/import-qb-ledger.ts so the two can't
 * drift apart.
 */

import { adminDb } from "@/lib/firebase/admin";
import { placeForCity } from "@/lib/geo/counties";
import {
  BANK_INBOX_COLLECTION,
  TRANSACTIONS_COLLECTION as TRANSACTIONS,
} from "@/lib/schemas";
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
  options: {
    excludeSource?: string;
    /** Also count synced bank rows still waiting in the review inbox — money
     *  that's on its way into the books even though it isn't there yet. */
    includeBankInbox?: boolean;
  } = {},
): Promise<DedupeIndex> {
  const { from, to } = dateRange(dates);
  const [snap, inbox] = await Promise.all([
    adminDb
      .collection(TRANSACTIONS)
      .where("date", ">=", from)
      .where("date", "<=", to)
      .select(...DEDUPE_FIELDS)
      .get(),
    options.includeBankInbox
      ? adminDb.collection(BANK_INBOX_COLLECTION).where("status", "==", "pending").get()
      : null,
  ]);
  const existing = snap.docs
    .map((d) => toExistingTransaction(d.id, d.data()))
    .filter((t) => t.source !== options.excludeSource);
  for (const d of inbox?.docs ?? []) {
    const x = d.data();
    if (x.date < from || x.date > to) continue;
    existing.push(
      toExistingTransaction(d.id, {
        date: x.date,
        amount: x.amount,
        type: x.type,
        vendor: x.suggestedVendor ?? "",
        description: x.description,
        source: "bank_sync",
      }),
    );
  }
  return buildDedupeIndex(existing, isCity);
}
