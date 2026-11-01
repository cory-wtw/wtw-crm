/**
 * Bank sync: pulls posted transactions for the chosen account(s) from
 * SimpleFIN and files them.
 *
 * - A transaction is keyed by the bank's own id, so a re-sync can't double it.
 * - A vendor we've categorised before goes straight into the books (and
 *   leaves a tombstone in the inbox, so deleting it from the books later
 *   doesn't bring it back on the next sync).
 * - Anything new, or anything that looks like a row already on file, waits in
 *   the bank inbox for a person.
 *
 * Server-only. The access URL never leaves this module's Firestore doc.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { adminDb } from "@/lib/firebase/admin";
import type { Actor } from "@/lib/ops/actor";
import {
  BANK_CONNECTIONS_COLLECTION,
  BANK_INBOX_COLLECTION,
  TRANSACTIONS_COLLECTION,
} from "@/lib/schemas";
import { buildVendorIndex, type KnownVendor } from "./bank-import";
import {
  bankTransactionDoc,
  earliestSyncFrom,
  findBankDuplicate,
  routeBankRow,
} from "./bank-sync-core";
import { loadDedupeIndex } from "./dedupe-db";
import { claimAccessUrl, fetchAccountSet, syncWindows, toBankRow, type BankRow } from "./simplefin";

export const SYSTEM_ACTOR: Actor = { uid: "system", email: "system" };

const CONNECTION_DOC = "simplefin";
/** Re-read this much before the last sync, for rows the bank posts late.
 *  Costs nothing: rows are keyed by bank id. */
const OVERLAP_DAYS = 30;
/** Opening Finances syncs if the last attempt is older than this. */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;
/** A run that hasn't touched the lock in this long is assumed dead. */
const LOCK_MS = 3 * 60 * 1000;
/** Firestore's code for "a doc with that id already exists". */
const ALREADY_EXISTS = 6;

const connectionRef = () => adminDb.collection(BANK_CONNECTIONS_COLLECTION).doc(CONNECTION_DOC);
const inboxRef = (id: string) => adminDb.collection(BANK_INBOX_COLLECTION).doc(id);
const txRef = (id: string) => adminDb.collection(TRANSACTIONS_COLLECTION).doc(id);

export type BankAccountInfo = {
  id: string;
  name: string;
  org: string;
  /** Only kept for accounts picked as WTW's — never for personal ones. */
  balance?: number;
};

export type SyncResult = {
  added: number;
  inbox: number;
  alreadyHad: number;
  warnings: string[];
};

export type SyncOutcome =
  | { status: "done"; result: SyncResult }
  | { status: "busy" }
  | { status: "not_ready" };

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

/** Claim a setup token and remember the bank's account names. Nothing syncs yet. */
export async function connectBank(token: string, actor: Actor): Promise<void> {
  const accessUrl = await claimAccessUrl(token);
  const set = await fetchAccountSet(accessUrl, { balancesOnly: true });
  // Names only: the token may see personal accounts, whose balances are none
  // of the Roster's business.
  const accounts: BankAccountInfo[] = set.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    org: a.org.name ?? a.org.domain ?? "",
  }));
  await connectionRef().set({
    accessUrl,
    accounts,
    // Nothing is picked by default.
    selectedAccountIds: [],
    syncFrom: "",
    syncedThrough: null,
    generation: randomUUID(),
    lastSyncAt: null,
    lastAttemptAt: null,
    lastResult: null,
    lastError: null,
    syncingSince: null,
    connectedBy: actor.uid,
    connectedAt: new Date(),
  });
  await logAudit({
    actor,
    action: "create",
    resourceType: "bankConnection",
    resourceId: CONNECTION_DOC,
    diff: { accountsVisible: { before: null, after: accounts.length } },
  });
}

export async function saveBankAccounts(
  selectedAccountIds: string[],
  syncFrom: string,
  actor: Actor,
): Promise<void> {
  if (syncFrom < earliestSyncFrom()) throw new Error("Pick a start date within the last year.");
  const before = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef());
    if (!snap.exists) throw new Error("Connect the bank first.");
    const d = snap.data()!;
    const accounts = (d.accounts ?? []) as BankAccountInfo[];
    const known = new Set(accounts.map((a) => a.id));
    const ids = selectedAccountIds.filter((id) => known.has(id));
    const changed =
      d.syncFrom !== syncFrom ||
      JSON.stringify([...(d.selectedAccountIds ?? [])].sort()) !== JSON.stringify([...ids].sort());
    tx.update(connectionRef(), {
      selectedAccountIds: ids,
      syncFrom,
      // Drop balances of anything no longer picked.
      accounts: accounts.map((a) => (ids.includes(a.id) ? a : { id: a.id, name: a.name, org: a.org })),
      // A new account or an earlier start date means reading history again.
      // The new generation tells a sync already running not to overwrite this.
      ...(changed ? { syncedThrough: null, generation: randomUUID() } : {}),
    });
    return { ids: (d.selectedAccountIds ?? []) as string[], syncFrom: String(d.syncFrom ?? ""), after: ids };
  });
  await logAudit({
    actor,
    action: "update",
    resourceType: "bankConnection",
    resourceId: CONNECTION_DOC,
    diff: {
      selectedAccountIds: { before: before.ids, after: before.after },
      syncFrom: { before: before.syncFrom, after: syncFrom },
    },
  });
}

export async function disconnectBank(actor: Actor): Promise<void> {
  await connectionRef().delete();
  await logAudit({ actor, action: "delete", resourceType: "bankConnection", resourceId: CONNECTION_DOC });
}

type LockedConnection = {
  accessUrl: string;
  accounts: BankAccountInfo[];
  selected: string[];
  syncFrom: string;
  syncedThrough: number | null;
  generation: string;
};

/** Take the run lock. Records the attempt, so failures back off too. */
async function acquireLock(): Promise<LockedConnection | "busy" | "not_ready"> {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef());
    if (!snap.exists) return "not_ready" as const;
    const d = snap.data()!;
    const selected = (d.selectedAccountIds ?? []) as string[];
    if (selected.length === 0 || !d.syncFrom) return "not_ready" as const;
    const since = toDate(d.syncingSince);
    if (since && Date.now() - since.getTime() < LOCK_MS) return "busy" as const;
    const now = new Date();
    tx.update(connectionRef(), { syncingSince: now, lastAttemptAt: now });
    return {
      accessUrl: String(d.accessUrl),
      accounts: (d.accounts ?? []) as BankAccountInfo[],
      selected,
      syncFrom: String(d.syncFrom),
      syncedThrough: typeof d.syncedThrough === "number" ? d.syncedThrough : null,
      generation: String(d.generation ?? ""),
    };
  });
}

async function releaseLock(fields: Record<string, unknown>) {
  try {
    await connectionRef().update({ syncingSince: null, ...fields });
  } catch {
    // Disconnected mid-run: nothing to release.
  }
}

export async function runBankSync(actor: Actor): Promise<SyncOutcome> {
  const conn = await acquireLock();
  if (conn === "busy" || conn === "not_ready") return { status: conn };

  try {
    const run = await syncInner(conn, actor);
    // Commit progress only if nobody changed the settings (or reconnected)
    // while we ran — otherwise their "re-read history" would be lost.
    const committed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(connectionRef());
      if (!snap.exists) return false;
      if (String(snap.data()!.generation ?? "") !== conn.generation) {
        tx.update(connectionRef(), { syncingSince: null });
        return false;
      }
      tx.update(connectionRef(), {
        syncingSince: null,
        lastSyncAt: new Date(),
        lastResult: run.result,
        lastError: null,
        accounts: run.accounts,
        // A partial run (an error, or an account missing from the response)
        // doesn't move the bookmark, so nothing in the gap is skipped.
        ...(run.complete ? { syncedThrough: run.syncedThrough } : {}),
      });
      return true;
    });
    const result = committed
      ? run.result
      : { ...run.result, warnings: [...run.result.warnings, "Settings changed while syncing. The next sync will catch up."] };
    return { status: "done", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bank sync failed.";
    await releaseLock({ lastError: message });
    throw err;
  }
}

/** Sync in the background if it's been a while. Never throws. */
export async function maybeAutoSync(): Promise<void> {
  try {
    const snap = await connectionRef().get();
    if (!snap.exists) return;
    const d = snap.data()!;
    const last = Math.max(toDate(d.lastSyncAt)?.getTime() ?? 0, toDate(d.lastAttemptAt)?.getTime() ?? 0);
    if (Date.now() - last < AUTO_SYNC_AFTER_MS) return;
    await runBankSync(SYSTEM_ACTOR);
  } catch (err) {
    console.error("auto bank sync failed", err);
  }
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/** Create, or leave alone if it already exists. Never overwrites a decision. */
async function createIfAbsent(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
  try {
    await ref.create(data);
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
    throw err;
  }
}

async function syncInner(conn: LockedConnection, actor: Actor) {
  const now = new Date();
  const from = conn.syncedThrough
    ? conn.syncedThrough - OVERLAP_DAYS * 86400
    : unix(new Date(`${conn.syncFrom}T00:00:00Z`));
  const to = unix(now) + 86400;

  // 1. Pull every posted transaction in range.
  const rows = new Map<string, BankRow>();
  const names = new Map<string, { name: string; org: string; balance: number }>();
  let errorCount = 0;
  let complete = true;
  const missing = new Set<string>();
  for (const w of syncWindows(from, to)) {
    const set = await fetchAccountSet(conn.accessUrl, { startDate: w.start, endDate: w.end, accountIds: conn.selected });
    if (set.errors.length > 0) {
      // Details can name other (personal) connections: log, don't store.
      console.warn("SimpleFIN errors", set.errors);
      errorCount += set.errors.length;
      complete = false;
    }
    if (set.erroredAccountIds.some((id) => conn.selected.includes(id))) complete = false;
    for (const id of conn.selected) {
      if (!set.accounts.some((a) => a.id === id)) {
        missing.add(id);
        complete = false;
      }
    }
    for (const a of set.accounts) {
      if (!conn.selected.includes(a.id)) continue; // never touch an unpicked account
      names.set(a.id, { name: a.name, org: a.org.name ?? a.org.domain ?? "", balance: a.balance });
      for (const t of a.transactions) {
        const row = toBankRow(a, t);
        if (row) rows.set(row.syncId, row);
      }
    }
    // Still alive: keep the lock.
    await connectionRef().update({ syncingSince: new Date() });
  }

  const accounts = conn.accounts.map((acc) => {
    const fresh = names.get(acc.id);
    return fresh ? { id: acc.id, ...fresh } : acc;
  });
  const warnings: string[] = [];
  if (errorCount > 0) {
    warnings.push(
      `SimpleFIN reported ${errorCount === 1 ? "a connection issue" : `${errorCount} connection issues`}. Check bridge.simplefin.org — the bank may need you to sign in again.`,
    );
  }
  for (const id of missing) {
    const acc = conn.accounts.find((a) => a.id === id);
    warnings.push(`${acc?.name ?? "A chosen account"} didn't come back from SimpleFIN. It may have been removed there.`);
  }

  // 2. Drop what's already in the books or the inbox (pending, handled, or a
  //    tombstone for an auto-filed row someone later deleted).
  const all = [...rows.values()];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i += 250) {
    const chunk = all.slice(i, i + 250);
    const snaps = await adminDb.getAll(
      ...chunk.map((r) => txRef(r.syncId)),
      ...chunk.map((r) => inboxRef(r.syncId)),
    );
    snaps.forEach((s) => s.exists && seen.add(s.id));
  }
  const fresh = all.filter((r) => !seen.has(r.syncId));

  // 3. Route the rest.
  let added = 0;
  let inbox = 0;
  if (fresh.length > 0) {
    const [categories, transactions, dedupe] = await Promise.all([
      listCategories(),
      listTransactions(),
      // Earlier bank rows have their own unique bank ids: two identical real
      // charges must not flag each other.
      loadDedupeIndex(fresh.map((r) => r.date), { excludeSource: "bank_sync" }),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const known: KnownVendor[] = transactions
      .filter((t) => t.vendor && t.amount > 0)
      .map((t) => ({ vendor: t.vendor, description: t.description, categoryId: t.categoryId, type: t.type }));
    const vendors = buildVendorIndex(known);
    const importBatch = `sync_${now.getTime()}`;
    const claimed = new Set<string>();
    const accountName = (id: string) => names.get(id)?.name ?? conn.accounts.find((a) => a.id === id)?.name ?? "";

    const tasks: (() => Promise<void>)[] = [];
    for (const r of fresh) {
      const route = routeBankRow(r, vendors, categoryById, dedupe, { importBatch, claimed });
      if (route.to === "books") {
        tasks.push(async () => {
          if (await createIfAbsent(txRef(r.syncId), bankTransactionDoc(r, route, actor.uid, now, importBatch))) {
            added++;
            // Tombstone, so deleting it from the books later sticks.
            await createIfAbsent(inboxRef(r.syncId), {
              ...r,
              accountName: accountName(r.accountId),
              status: "auto",
              createdAt: now,
            });
          }
        });
      } else {
        tasks.push(async () => {
          const dup = route.duplicateOf;
          const created = await createIfAbsent(inboxRef(r.syncId), {
            ...r,
            accountName: accountName(r.accountId),
            suggestedVendor: route.vendor,
            suggestedCategoryId: route.suggestedCategoryId,
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
          });
          if (created) inbox++;
        });
      }
    }
    for (let i = 0; i < tasks.length; i += 25) {
      await Promise.all(tasks.slice(i, i + 25).map((t) => t()));
    }
    if (added > 0) {
      await logAudit({
        actor,
        action: "create",
        resourceType: "transaction",
        resourceId: "bank-sync",
        diff: { transactionsAdded: { before: null, after: added } },
      });
    }
  }

  return {
    result: { added, inbox, alreadyHad: all.length - fresh.length, warnings } satisfies SyncResult,
    syncedThrough: unix(now),
    complete,
    accounts,
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
  const snap = await adminDb.collection(BANK_INBOX_COLLECTION).where("status", "==", "pending").get();
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

/** Thrown by addInboxItem when the books already have something like it. */
export class LikelyDuplicateError extends Error {
  constructor(
    message: string,
    readonly match: { date: string; amount: number; vendor: string; source: string },
  ) {
    super(message);
  }
}

/** File an inbox row in the books. */
export async function addInboxItem(
  syncId: string,
  pick: { vendor: string; categoryId: string; force?: boolean },
  actor: Actor,
): Promise<void> {
  const categories = await listCategories();
  const category = categories.find((c) => c.id === pick.categoryId);
  if (!category) throw new Error("Pick a category.");
  const vendor = pick.vendor.trim().slice(0, 200);
  if (!vendor) throw new Error("Give it a vendor name.");

  const pre = await inboxRef(syncId).get();
  if (!pre.exists || pre.data()!.status !== "pending") throw new Error("Someone already handled this one.");
  const row = pre.data() as BankRow;

  // Something may have landed since the sync looked — a CSV import, a hand entry.
  if (!pick.force) {
    const index = await loadDedupeIndex([row.date], { excludeSource: "bank_sync" });
    const dup = findBankDuplicate(row, vendor, index);
    if (dup) {
      const e = dup.existing;
      throw new LikelyDuplicateError(`Already on file: ${e.date} · ${e.vendor || "(no vendor)"} · $${Math.abs(e.amount).toFixed(2)} (${dup.reason}).`, {
        date: e.date,
        amount: e.amount,
        vendor: e.vendor,
        source: e.source,
      });
    }
  }

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(inboxRef(syncId));
    if (!snap.exists || snap.data()!.status !== "pending") throw new Error("Someone already handled this one.");
    const now = new Date();
    tx.set(txRef(syncId), bankTransactionDoc(snap.data() as BankRow, { vendor, categoryId: category.id, type: category.type }, actor.uid, now, "inbox"));
    tx.update(inboxRef(syncId), { status: "added", resolvedBy: actor.uid, resolvedAt: now, transactionId: syncId });
  });
  await logAudit({ actor, action: "create", resourceType: "transaction", resourceId: syncId });
}

/** Not WTW money, or already on file. Kept so the next sync skips it. */
export async function dismissInboxItem(syncId: string, actor: Actor): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(inboxRef(syncId));
    if (!snap.exists || snap.data()!.status !== "pending") throw new Error("Someone already handled this one.");
    tx.update(inboxRef(syncId), { status: "dismissed", resolvedBy: actor.uid, resolvedAt: new Date() });
  });
  await logAudit({
    actor,
    action: "update",
    resourceType: "bankInboxItem",
    resourceId: syncId,
    diff: { status: { before: "pending", after: "dismissed" } },
  });
}
