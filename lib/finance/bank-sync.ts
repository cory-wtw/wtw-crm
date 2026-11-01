/**
 * Daily bank sync: pulls posted transactions for the chosen account(s) from
 * SimpleFIN and files them.
 *
 * - A transaction is keyed by the bank's own id, so a re-sync can't double it.
 * - A vendor we've categorised before goes straight into the books.
 * - Anything new, or anything that looks like a row already on file (a hand
 *   entry, an old CSV import), waits in the bank inbox for a person.
 *
 * Server-only. The access URL never leaves this module's Firestore doc.
 */

import "server-only";
import { logAudit } from "@/lib/audit";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { adminDb } from "@/lib/firebase/admin";
import {
  BANK_CONNECTIONS_COLLECTION,
  BANK_INBOX_COLLECTION,
  TRANSACTIONS_COLLECTION,
  type TransactionType,
} from "@/lib/schemas";
import {
  buildVendorIndex,
  matchVendor,
  suggestVendorName,
  type KnownVendor,
} from "./bank-import";
import { findLikelyDuplicate, toIncomingTransaction } from "./dedupe";
import { loadDedupeIndex } from "./dedupe-db";
import {
  claimAccessUrl,
  fetchAccountSet,
  syncWindows,
  toBankRow,
  type BankRow,
} from "./simplefin";

const CONNECTION_DOC = "simplefin";
/** Re-read this much before the last sync, for rows the bank posts late. */
const OVERLAP_DAYS = 10;
/** Opening Finances syncs if the last run is older than this. */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;
/** A run that hasn't finished in this long is assumed dead. */
const LOCK_MS = 5 * 60 * 1000;

const connectionRef = () =>
  adminDb.collection(BANK_CONNECTIONS_COLLECTION).doc(CONNECTION_DOC);

export type BankAccountInfo = {
  id: string;
  name: string;
  org: string;
  balance: number;
};

export type SyncResult = {
  added: number;
  inbox: number;
  alreadyHad: number;
  warnings: string[];
};

/** What the page may see. Deliberately has no accessUrl. */
export type BankConnectionView = {
  accounts: BankAccountInfo[];
  selectedAccountIds: string[];
  syncFrom: string;
  lastSyncAt: Date | null;
  lastResult: SyncResult | null;
  lastError: string | null;
  connectedAt: Date | null;
};

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: () => Date }).toDate === "function"
    ? (v as { toDate: () => Date }).toDate()
    : v instanceof Date
      ? v
      : null;

export async function getBankConnection(): Promise<BankConnectionView | null> {
  const snap = await connectionRef().get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    accounts: (d.accounts ?? []) as BankAccountInfo[],
    selectedAccountIds: (d.selectedAccountIds ?? []) as string[],
    syncFrom: String(d.syncFrom ?? ""),
    lastSyncAt: toDate(d.lastSyncAt),
    lastResult: (d.lastResult ?? null) as SyncResult | null,
    lastError: (d.lastError ?? null) as string | null,
    connectedAt: toDate(d.connectedAt),
  };
}

/** Claim a setup token and remember the bank's accounts. Nothing syncs yet. */
export async function connectBank(token: string, uid: string): Promise<BankAccountInfo[]> {
  const accessUrl = await claimAccessUrl(token);
  const set = await fetchAccountSet(accessUrl, { balancesOnly: true });
  const accounts: BankAccountInfo[] = set.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    org: a.org.name ?? a.org.domain ?? "",
    balance: a.balance,
  }));
  const now = new Date();
  await connectionRef().set({
    accessUrl,
    accounts,
    // Nothing is picked by default: the token may see personal accounts too.
    selectedAccountIds: [],
    syncFrom: "",
    syncedThrough: null,
    lastSyncAt: null,
    lastResult: null,
    lastError: null,
    syncingSince: null,
    connectedBy: uid,
    connectedAt: now,
  });
  await logAudit({
    action: "create",
    resourceType: "bankConnection",
    resourceId: CONNECTION_DOC,
    diff: { accounts: { before: null, after: accounts.map((a) => `${a.org} ${a.name}`) } },
  });
  return accounts;
}

export async function saveBankAccounts(selectedAccountIds: string[], syncFrom: string) {
  const snap = await connectionRef().get();
  if (!snap.exists) throw new Error("Connect the bank first.");
  const known = new Set(((snap.data()!.accounts ?? []) as BankAccountInfo[]).map((a) => a.id));
  const ids = selectedAccountIds.filter((id) => known.has(id));
  const before = snap.data()!;
  const changed =
    before.syncFrom !== syncFrom ||
    JSON.stringify([...(before.selectedAccountIds ?? [])].sort()) !== JSON.stringify([...ids].sort());
  await connectionRef().update({
    selectedAccountIds: ids,
    syncFrom,
    // A new account or an earlier start date means reading history again.
    ...(changed ? { syncedThrough: null } : {}),
  });
  await logAudit({
    action: "update",
    resourceType: "bankConnection",
    resourceId: CONNECTION_DOC,
    diff: {
      selectedAccountIds: { before: before.selectedAccountIds ?? [], after: ids },
      syncFrom: { before: before.syncFrom ?? "", after: syncFrom },
    },
  });
}

export async function disconnectBank() {
  await connectionRef().delete();
  await logAudit({ action: "delete", resourceType: "bankConnection", resourceId: CONNECTION_DOC });
}

/** Take the run lock, or report that another run holds it. */
async function acquireLock(): Promise<FirebaseFirestore.DocumentData | null> {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef());
    if (!snap.exists) return null;
    const d = snap.data()!;
    const since = toDate(d.syncingSince);
    if (since && Date.now() - since.getTime() < LOCK_MS) return null;
    tx.update(connectionRef(), { syncingSince: new Date() });
    return d;
  });
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * Sync now. Returns null when there's nothing to do (no bank, no account
 * picked, or another run in progress).
 */
export async function runBankSync(actorUid: string): Promise<SyncResult | null> {
  const conn = await acquireLock();
  if (!conn) return null;
  const selected = (conn.selectedAccountIds ?? []) as string[];
  if (selected.length === 0 || !conn.syncFrom) {
    await connectionRef().update({ syncingSince: null });
    return null;
  }

  try {
    const result = await syncInner(conn, selected, actorUid);
    await connectionRef().update({
      syncingSince: null,
      lastSyncAt: new Date(),
      lastResult: result.result,
      lastError: null,
      syncedThrough: result.syncedThrough,
      accounts: result.accounts ?? conn.accounts,
    });
    return result.result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bank sync failed.";
    await connectionRef().update({ syncingSince: null, lastError: message });
    throw err;
  }
}

/** Sync in the background if it's been a while. Never throws. */
export async function maybeAutoSync(): Promise<void> {
  try {
    const snap = await connectionRef().get();
    if (!snap.exists) return;
    const last = toDate(snap.data()!.lastSyncAt);
    if (last && Date.now() - last.getTime() < AUTO_SYNC_AFTER_MS) return;
    await runBankSync("system");
  } catch (err) {
    console.error("auto bank sync failed", err);
  }
}

async function syncInner(
  conn: FirebaseFirestore.DocumentData,
  selected: string[],
  actorUid: string,
) {
  const now = new Date();
  const from = conn.syncedThrough
    ? Number(conn.syncedThrough) - OVERLAP_DAYS * 86400
    : unix(new Date(`${conn.syncFrom}T00:00:00Z`));
  const to = unix(now) + 86400;

  // 1. Pull every posted transaction in range.
  const rows = new Map<string, BankRow>();
  const accountNames = new Map<string, string>();
  const warnings = new Set<string>();
  let accounts: unknown = null;
  for (const w of syncWindows(from, to)) {
    const set = await fetchAccountSet(conn.accessUrl, {
      startDate: w.start,
      endDate: w.end,
      accountIds: selected,
    });
    set.errors.forEach((e) => warnings.add(e));
    for (const a of set.accounts) {
      if (!selected.includes(a.id)) continue; // never touch an unpicked account
      accountNames.set(a.id, a.name);
      for (const t of a.transactions) {
        const row = toBankRow(a, t);
        if (row) rows.set(row.syncId, row);
      }
    }
    accounts = ((conn.accounts ?? []) as BankAccountInfo[]).map((acc) => {
      const fresh = set.accounts.find((a) => a.id === acc.id);
      return fresh ? { ...acc, balance: fresh.balance } : acc;
    });
  }

  // 2. Drop what's already in the books or the inbox.
  const all = [...rows.values()];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i += 300) {
    const chunk = all.slice(i, i + 300);
    const snaps = await adminDb.getAll(
      ...chunk.map((r) => adminDb.collection(TRANSACTIONS_COLLECTION).doc(r.syncId)),
      ...chunk.map((r) => adminDb.collection(BANK_INBOX_COLLECTION).doc(r.syncId)),
    );
    snaps.forEach((s) => s.exists && seen.add(s.id));
  }
  const fresh = all.filter((r) => !seen.has(r.syncId));
  const alreadyHad = all.length - fresh.length;

  // 3. Sort the rest: known vendor and nothing similar on file → books;
  //    otherwise → inbox.
  let added = 0;
  let inbox = 0;
  if (fresh.length > 0) {
    const [categories, transactions, dedupeIndex] = await Promise.all([
      listCategories(),
      listTransactions(),
      loadDedupeIndex(fresh.map((r) => r.date)),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const known: KnownVendor[] = transactions
      .filter((t) => t.vendor && t.amount > 0)
      .map((t) => ({ vendor: t.vendor, description: t.description, categoryId: t.categoryId, type: t.type }));
    const vendorIndex = buildVendorIndex(known);
    const importBatch = `sync_${now.getTime()}`;
    const claimed = new Set<string>();

    const writes: { collection: string; id: string; data: Record<string, unknown> }[] = [];
    for (const r of fresh) {
      const match = matchVendor(r.description, r.type, vendorIndex);
      const category = match ? categoryById.get(match.categoryId) : undefined;
      const vendor = match?.vendor ?? suggestVendorName(r.description);
      const candidate = {
        date: r.date,
        amount: r.amount,
        type: r.type,
        vendor,
        description: r.description,
      };
      const dup = findLikelyDuplicate(toIncomingTransaction(candidate), dedupeIndex, {
        importBatch,
        claimed,
      });

      if (category && !dup) {
        writes.push({
          collection: TRANSACTIONS_COLLECTION,
          id: r.syncId,
          data: bankTransactionDoc(r, { vendor, categoryId: category.id, type: category.type }, actorUid, now, importBatch),
        });
        added++;
      } else {
        writes.push({
          collection: BANK_INBOX_COLLECTION,
          id: r.syncId,
          data: {
            ...r,
            accountName: accountNames.get(r.accountId) ?? "",
            suggestedVendor: vendor,
            suggestedCategoryId: category?.id ?? null,
            duplicateOf: dup
              ? {
                  id: dup.existing.id,
                  date: dup.existing.date,
                  amount: dup.existing.amount,
                  vendor: dup.existing.vendor,
                  source: dup.existing.source,
                  reason: dup.reason,
                }
              : null,
            status: "pending",
            createdAt: now,
          },
        });
        inbox++;
      }
    }

    for (let i = 0; i < writes.length; i += 400) {
      const batch = adminDb.batch();
      for (const w of writes.slice(i, i + 400)) {
        batch.set(adminDb.collection(w.collection).doc(w.id), w.data);
      }
      await batch.commit();
    }
    if (added > 0) {
      await logAudit({
        action: "create",
        resourceType: "transaction",
        resourceId: "bank-sync",
        diff: {
          transactionIds: {
            before: null,
            after: writes.filter((w) => w.collection === TRANSACTIONS_COLLECTION).map((w) => w.id),
          },
        },
      });
    }
  }

  return {
    result: { added, inbox, alreadyHad, warnings: [...warnings] } satisfies SyncResult,
    syncedThrough: unix(now),
    accounts,
  };
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

// ---------------------------------------------------------------------------
// Inbox

export type InboxItem = BankRow & {
  accountName: string;
  suggestedVendor: string;
  suggestedCategoryId: string | null;
  duplicateOf: {
    id: string;
    date: string;
    amount: number;
    vendor: string;
    source: string;
    reason: string;
  } | null;
};

export async function listInbox(): Promise<InboxItem[]> {
  const snap = await adminDb
    .collection(BANK_INBOX_COLLECTION)
    .where("status", "==", "pending")
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        syncId: d.id,
        accountId: x.accountId,
        bankTxnId: x.bankTxnId,
        date: x.date,
        description: x.description,
        amount: x.amount,
        type: x.type,
        accountName: x.accountName ?? "",
        suggestedVendor: x.suggestedVendor ?? "",
        suggestedCategoryId: x.suggestedCategoryId ?? null,
        duplicateOf: x.duplicateOf ?? null,
      } as InboxItem;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** File an inbox row in the books. */
export async function addInboxItem(
  syncId: string,
  pick: { vendor: string; categoryId: string },
  uid: string,
): Promise<void> {
  const ref = adminDb.collection(BANK_INBOX_COLLECTION).doc(syncId);
  const txRef = adminDb.collection(TRANSACTIONS_COLLECTION).doc(syncId);
  const categories = await listCategories();
  const category = categories.find((c) => c.id === pick.categoryId);
  if (!category) throw new Error("Pick a category.");
  const vendor = pick.vendor.trim().slice(0, 200);
  if (!vendor) throw new Error("Give it a vendor name.");

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.status !== "pending") {
      throw new Error("Someone already handled this one.");
    }
    const r = snap.data() as BankRow;
    const now = new Date();
    tx.set(txRef, bankTransactionDoc(r, { vendor, categoryId: category.id, type: category.type }, uid, now, "inbox"));
    tx.update(ref, { status: "added", resolvedBy: uid, resolvedAt: now, transactionId: syncId });
  });
  await logAudit({ action: "create", resourceType: "transaction", resourceId: syncId });
}

/** Not WTW money, or already on file. Kept so the next sync skips it. */
export async function dismissInboxItem(syncId: string, uid: string): Promise<void> {
  const ref = adminDb.collection(BANK_INBOX_COLLECTION).doc(syncId);
  await ref.update({ status: "dismissed", resolvedBy: uid, resolvedAt: new Date() });
  await logAudit({ action: "update", resourceType: "bankInboxItem", resourceId: syncId, diff: { status: { before: "pending", after: "dismissed" } } });
}
