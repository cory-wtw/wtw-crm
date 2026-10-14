"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  TRANSACTION_SOURCE_LABELS,
  type TransactionSource,
  type TransactionType,
} from "@/lib/schemas";
import { formatUsdCents } from "@/lib/format";

export type TransactionRow = {
  id: string;
  date: string;
  vendor: string;
  description: string;
  donorName: string;
  campaign: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  customSplit: boolean;
  source: TransactionSource;
};

const PAGE = 100;

const controlClasses =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function TransactionsTable({
  rows,
  categories,
}: {
  rows: TransactionRow[];
  categories: { id: string; name: string; type: TransactionType }[];
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"" | TransactionType>("");
  const [categoryId, setCategoryId] = useState("");
  const [year, setYear] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type && r.type !== type) return false;
      if (categoryId && r.categoryId !== categoryId) return false;
      if (year && !r.date.startsWith(year)) return false;
      if (!q) return true;
      return [r.vendor, r.description, r.donorName, r.campaign, r.categoryName]
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [rows, query, type, categoryId, year]);

  const net = useMemo(
    () =>
      filtered.reduce(
        (s, r) => s + Math.round(r.amount * 100) * (r.type === "income" ? 1 : -1),
        0,
      ) / 100,
    [filtered],
  );

  const shown = filtered.slice(0, limit);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search vendor, donor, memo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${controlClasses} w-full max-w-xs`}
        />
        <select value={type} onChange={(e) => setType(e.target.value as "" | TransactionType)} className={controlClasses}>
          <option value="">In &amp; out</option>
          <option value="income">Money in</option>
          <option value="expense">Money out</option>
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={controlClasses}>
          <option value="">All categories</option>
          {categories
            .filter((c) => !type || c.type === type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={controlClasses}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length} · net{" "}
          <span className="font-bold tabular-nums">{formatUsdCents(net)}</span>
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {shown.map((r) => {
          const who = r.type === "income" ? r.donorName || r.vendor : r.vendor;
          // Net flow: a negative expense (refund) is money in, and vice versa.
          const flow = r.type === "income" ? r.amount : -r.amount;
          return (
            <li key={r.id}>
              <Link
                href={`/finances/transactions/${r.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{r.date}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {who || r.description || "—"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      r.categoryName,
                      r.campaign,
                      r.customSplit ? "custom split" : "",
                      r.source !== "manual" ? TRANSACTION_SOURCE_LABELS[r.source] : "",
                      who && r.description !== who ? r.description : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    flow > 0 ? "text-[color:var(--wtw-deep-gold)]" : ""
                  }`}
                >
                  {flow > 0 ? "+" : "−"}
                  {formatUsdCents(Math.abs(flow))}
                  {r.amount < 0 && <span className="ml-1 text-[10px] uppercase text-muted-foreground">refund</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Nothing matches those filters.
        </p>
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
