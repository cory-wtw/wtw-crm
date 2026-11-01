/**
 * The pure half of the bank sync — no Firestore, so it can be unit-tested.
 * lib/finance/bank-sync.ts does the I/O around it.
 */

import type { TransactionType } from "@/lib/schemas/finance";
import { matchVendor, suggestVendorName, type VendorIndex } from "./bank-import";
import { findLikelyDuplicate, type DedupeIndex, type DuplicateMatch } from "./dedupe";
import type { BankRow } from "./simplefin";

/** Furthest back a first sync may reach. Banks share ~90 days anyway; this
 *  keeps a typo'd start date from hammering SimpleFIN's rate limit. */
export const MAX_HISTORY_DAYS = 366;

export function earliestSyncFrom(now: Date = new Date()): string {
  return new Date(now.getTime() - MAX_HISTORY_DAYS * 86400_000).toISOString().slice(0, 10);
}

const other = (t: TransactionType): TransactionType => (t === "income" ? "expense" : "income");

/**
 * The likely duplicate already on file for a bank row, if any. A bank row can
 * be on file in two shapes: as itself (money out → a positive expense), or as
 * a refund filed under the opposite category (money in from a vendor → a
 * negative expense). Check both.
 */
export function findBankDuplicate(
  r: Pick<BankRow, "date" | "amount" | "type" | "description">,
  vendor: string,
  index: DedupeIndex,
  options: { importBatch?: string; claimed?: Set<string> } = {},
): DuplicateMatch | null {
  const base = { date: r.date, vendor, description: r.description };
  return (
    findLikelyDuplicate({ ...base, amount: r.amount, type: r.type }, index, options) ??
    findLikelyDuplicate({ ...base, amount: -r.amount, type: other(r.type) }, index, options)
  );
}

export type Routing =
  | { to: "books"; vendor: string; categoryId: string; type: TransactionType }
  | {
      to: "inbox";
      vendor: string;
      suggestedCategoryId: string | null;
      duplicateOf: DuplicateMatch | null;
    };

/**
 * Where a fresh bank row goes. Straight into the books only when we've
 * categorised this vendor before AND nothing similar is already on file.
 */
export function routeBankRow(
  r: Pick<BankRow, "date" | "amount" | "type" | "description">,
  vendors: VendorIndex,
  categories: ReadonlyMap<string, { id: string; type: TransactionType }>,
  dedupe: DedupeIndex,
  options: { importBatch?: string; claimed?: Set<string> } = {},
): Routing {
  const match = matchVendor(r.description, r.type, vendors);
  const category = match ? categories.get(match.categoryId) : undefined;
  const vendor = match?.vendor ?? suggestVendorName(r.description);
  const dup = findBankDuplicate(r, vendor, dedupe, options);
  if (category && !dup) return { to: "books", vendor, categoryId: category.id, type: category.type };
  return { to: "inbox", vendor, suggestedCategoryId: category?.id ?? null, duplicateOf: dup };
}

/** The books' copy of a bank row. Doc id = the row's syncId. */
export function bankTransactionDoc(
  r: Pick<BankRow, "date" | "description" | "amount" | "type" | "accountId" | "bankTxnId" | "syncId">,
  pick: { vendor: string; categoryId: string; type: TransactionType },
  uid: string,
  now: Date,
  importBatch: string,
): Record<string, unknown> {
  // Money in filed under an expense category is a refund, and vice versa.
  const signed = pick.type === r.type ? r.amount : -r.amount;
  return {
    date: r.date,
    vendor: pick.vendor,
    description: r.description,
    amount: Math.round(signed * 100) / 100,
    type: pick.type,
    categoryId: pick.categoryId,
    source: "bank_sync",
    bankAccountId: r.accountId,
    bankTxnId: r.bankTxnId,
    importBatch,
    importKey: r.syncId,
    createdBy: uid,
    createdAt: now,
    updatedBy: uid,
    updatedAt: now,
  };
}
