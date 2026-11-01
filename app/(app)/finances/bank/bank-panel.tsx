"use client";

import { useState, useTransition } from "react";
import type { BankConnectionView, InboxItem } from "@/lib/finance/bank-sync";
import { formatDate, formatShortDate, formatUsdCents } from "@/lib/format";
import { TRANSACTION_SOURCE_LABELS, type Category, type TransactionSource } from "@/lib/schemas";
import {
  addInboxItemAction,
  connectBankAction,
  disconnectBankAction,
  dismissInboxItemAction,
  saveBankAccountsAction,
  syncBankAction,
} from "./actions";

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const primary =
  "inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50";
const secondary =
  "inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold hover:bg-secondary disabled:opacity-50";
const card = "rounded-lg border border-border bg-card p-4 sm:p-5";

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function BankPanel({
  connection,
  inbox,
  categories,
}: {
  connection: BankConnectionView | null;
  inbox: InboxItem[];
  categories: Category[];
}) {
  if (!connection) return <ConnectForm />;
  const picked = connection.selectedAccountIds.length > 0 && connection.syncFrom;
  return (
    <div className="space-y-6">
      {!picked ? (
        <AccountPicker connection={connection} />
      ) : (
        <>
          <SyncStatus connection={connection} />
          <Inbox inbox={inbox} categories={categories} />
          <details className={card}>
            <summary className="cursor-pointer text-sm font-bold">Accounts and settings</summary>
            <div className="mt-4">
              <AccountPicker connection={connection} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function ConnectForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={`${card} max-w-2xl space-y-4`}>
      <h2 className="text-lg font-black">Connect the bank</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Sign in at{" "}
          <a href="https://bridge.simplefin.org" target="_blank" rel="noreferrer" className="font-bold underline">
            bridge.simplefin.org
          </a>{" "}
          and make sure WTW&apos;s bank is connected there.
        </li>
        <li>Under Apps, create a new setup token and copy it.</li>
        <li>Paste it here. It works once, and only reads — it can&apos;t move money.</li>
      </ol>
      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        rows={3}
        placeholder="Paste the SimpleFIN setup token"
        className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        disabled={pending || !token.trim()}
        className={primary}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await connectBankAction(token);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}

function AccountPicker({ connection }: { connection: BankConnectionView }) {
  const [ids, setIds] = useState<Set<string>>(new Set(connection.selectedAccountIds));
  const [syncFrom, setSyncFrom] = useState(connection.syncFrom || startOfYear());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next);
  };
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-black">Which account is WTW&apos;s?</h2>
        <p className="text-sm text-muted-foreground">
          The SimpleFIN login can see every account linked to it. Only the
          ones you tick here are ever read into the books.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {connection.accounts.map((a) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-center gap-3 p-3">
              <input type="checkbox" checked={ids.has(a.id)} onChange={() => toggle(a.id)} className="size-4" />
              <span className="flex-1 text-sm">
                <span className="font-bold">{a.name}</span>
                {a.org && <span className="text-muted-foreground"> · {a.org}</span>}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">{formatUsdCents(a.balance)}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block max-w-xs space-y-1 text-sm">
        <span className="font-bold">Bring in transactions from</span>
        <input type="date" value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} className={control} />
        <span className="block text-xs text-muted-foreground">
          Banks usually share the last 90 days. Anything already on file from a
          CSV import is caught and held for you to check, not doubled.
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || ids.size === 0 || !syncFrom}
          className={primary}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await saveBankAccountsAction({ accountIds: [...ids], syncFrom });
              if (!res.ok) return setError(res.error);
              const sync = await syncBankAction();
              if (!sync.ok) setError(sync.error);
            })
          }
        >
          {pending ? "Syncing…" : "Save and sync"}
        </button>
        <button
          type="button"
          disabled={pending}
          className={secondary}
          onClick={() => {
            if (!confirm("Disconnect the bank? Transactions already in the books stay.")) return;
            start(async () => {
              const res = await disconnectBankAction();
              if (!res.ok) setError(res.error);
            });
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function SyncStatus({ connection }: { connection: BankConnectionView }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const r = connection.lastResult;
  const accounts = connection.accounts.filter((a) => connection.selectedAccountIds.includes(a.id));
  return (
    <div className={`${card} flex flex-wrap items-center gap-4`}>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-bold">
          {accounts.map((a) => `${a.org ? `${a.org} ` : ""}${a.name} · ${formatUsdCents(a.balance)}`).join(" · ")}
        </p>
        <p className="text-sm text-muted-foreground">
          {connection.lastSyncAt ? `Last synced ${formatDate(connection.lastSyncAt)}` : "Not synced yet"}
          {r && ` · ${r.added} added, ${r.inbox} to review, ${r.alreadyHad} already on file`}
        </p>
        {connection.lastError && (
          <p className="text-sm text-destructive">Last sync failed: {connection.lastError}</p>
        )}
        {r?.warnings.map((w) => (
          <p key={w} className="text-sm text-[color:var(--wtw-deep-gold)]">SimpleFIN: {w}</p>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <button
        type="button"
        disabled={pending}
        className={secondary}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await syncBankAction();
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

function Inbox({ inbox, categories }: { inbox: InboxItem[]; categories: Category[] }) {
  if (inbox.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nothing to review. New bank transactions from known vendors are going
        straight into the books.
      </p>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black">To review ({inbox.length})</h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {inbox.map((item) => (
          <InboxRow key={item.syncId} item={item} categories={categories} />
        ))}
      </ul>
    </section>
  );
}

function InboxRow({ item, categories }: { item: InboxItem; categories: Category[] }) {
  const [vendor, setVendor] = useState(item.suggestedVendor);
  const [categoryId, setCategoryId] = useState(item.suggestedCategoryId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const options = categories.filter((c) => c.type === item.type);
  const dup = item.duplicateOf;
  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm tabular-nums text-muted-foreground">{formatShortDate(item.date)}</span>
        <span className="flex-1 break-words text-sm">{item.description}</span>
        <span className={`text-sm font-bold tabular-nums ${item.type === "income" ? "text-green-700 dark:text-green-400" : ""}`}>
          {item.type === "income" ? "+" : "−"}
          {formatUsdCents(item.amount)}
        </span>
      </div>
      {dup && (
        <p className="rounded-md bg-secondary p-2 text-xs">
          Looks like {formatShortDate(dup.date)} · {dup.vendor || "(no vendor)"} · {formatUsdCents(Math.abs(dup.amount))}{" "}
          already on file ({TRANSACTION_SOURCE_LABELS[dup.source as TransactionSource] ?? dup.source}) — {dup.reason}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Vendor" placeholder="Vendor" className={control} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className={control}>
          <option value="">Pick a category…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !vendor.trim() || !categoryId}
          className={secondary}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await addInboxItemAction({ syncId: item.syncId, vendor, categoryId });
              if (!res.ok) setError(res.error);
            })
          }
        >
          {dup ? "Add anyway" : "Add to books"}
        </button>
        <button
          type="button"
          disabled={pending}
          className={secondary}
          title={dup ? "It's the same money — skip it" : "Not WTW money — skip it"}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await dismissInboxItemAction(item.syncId);
              if (!res.ok) setError(res.error);
            })
          }
        >
          {dup ? "Duplicate — skip" : "Skip"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}
