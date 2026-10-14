"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUsdCents } from "@/lib/format";
import { setVendorNameAction } from "./actions";

export type VendorRow = {
  name: string;
  keys: string[];
  total: number;
  count: number;
  first: string;
  last: string;
  category: string;
};

export type VendorTx = {
  id: string;
  date: string;
  amount: number;
  label: string;
  detail: string;
  category: string;
  vendor: string;
};

const PAGE = 40;

export function SpendingVendors({ vendors, transactions }: { vendors: VendorRow[]; transactions: VendorTx[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const total = vendors.reduce((s, v) => s + Math.round(v.total * 100), 0) / 100;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? vendors.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)) : vendors;
  }, [vendors, query]);
  const names = useMemo(() => vendors.map((v) => v.name), [vendors]);

  if (vendors.length === 0) return <p className="text-xs text-muted-foreground">No spending in this range.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors or categories…"
          className="h-11 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {vendors.length} vendors · {formatUsdCents(total)}
        </span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {filtered.slice(0, limit).map((v) => {
          const isOpen = open === v.name;
          const share = total > 0 ? (v.total / total) * 100 : 0;
          return (
            <li key={v.name}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : v.name)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{v.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {v.category} · {v.count} {v.count === 1 ? "charge" : "charges"} · {v.first === v.last ? v.first : `${v.first} → ${v.last}`}
                  </span>
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-secondary sm:block">
                  <span className="block h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">{formatUsdCents(v.total)}</span>
              </button>
              {isOpen && <VendorDetail vendor={v} names={names} transactions={transactions.filter((t) => t.vendor === v.name)} />}
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No vendors match.</p>
      )}
      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="h-11 w-full rounded-md border border-border bg-card text-sm font-bold hover:bg-secondary"
        >
          Show more ({filtered.length - limit} left)
        </button>
      )}
    </div>
  );
}

function VendorDetail({ vendor, names, transactions }: { vendor: VendorRow; names: string[]; transactions: VendorTx[] }) {
  const router = useRouter();
  const [name, setName] = useState(vendor.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const merging = name.trim() !== vendor.name && names.some((n) => n.toLowerCase() === name.trim().toLowerCase());

  async function save(next: string) {
    setBusy(true);
    setError(null);
    const res = await setVendorNameAction({ keys: vendor.keys, name: next });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-3 border-t border-border bg-background/60 px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== vendor.name) save(name.trim());
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="text-xs font-bold" htmlFor={`name-${vendor.keys[0]}`}>
          Name
        </label>
        <input
          id={`name-${vendor.keys[0]}`}
          list="vendor-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm sm:max-w-xs"
        />
        <datalist id="vendor-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={busy || !name.trim() || name.trim() === vendor.name}
          className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Saving…" : merging ? `Merge into ${name.trim()}` : "Rename"}
        </button>
        <button
          type="button"
          onClick={() => save("")}
          disabled={busy}
          className="h-9 rounded-md px-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          title="Go back to the name from the bank or import"
        >
          Reset
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        Type another vendor&apos;s name to merge them. The name sticks for future imports with the same bank text.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {sorted.map((t) => (
          <li key={t.id}>
            <Link
              href={`/finances/transactions/${t.id}`}
              className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
            >
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{t.date}</span>
              <span className="min-w-0 flex-1 truncate">
                {t.label}
                {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
                <span className="text-muted-foreground"> · {t.category}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatUsdCents(t.amount)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
