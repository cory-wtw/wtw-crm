"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatShortDate, formatUsdCents } from "@/lib/format";
import type { RecurringCharge } from "@/lib/finance/spending";
import { setVendorMonthlyAction } from "./actions";

type Row = RecurringCharge & { category: string };

export function RecurringList({ rows, empty, bare }: { rows: Row[]; empty: string; bare?: boolean }) {
  if (rows.length === 0) return empty ? <p className="text-xs text-muted-foreground">{empty}</p> : null;
  return (
    <ul className={`divide-y divide-border ${bare ? "" : "rounded-lg border border-border bg-card"}`}>
      {rows.map((r) => (
        <RecurringItem key={r.name} row={r} />
      ))}
    </ul>
  );
}

function RecurringItem({ row }: { row: Row }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.override ?? row.estimated));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(monthly: number | null) {
    setBusy(true);
    setError(null);
    const res = await setVendorMonthlyAction({ keys: row.keys, name: row.name, monthly });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.category} · last bills:{" "}
            {row.recentBills.map((b) => `${formatShortDate(b.date)} ${formatUsdCents(b.amount)}`).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums">
            {formatUsdCents(row.monthly)}
            <span className="text-xs font-normal text-muted-foreground">/mo</span>
          </p>
          <button
            type="button"
            onClick={() => {
              // Start from the current figure every time; the saved amount
              // may have changed since this row first rendered.
              if (!editing) setValue(String(row.override ?? row.estimated));
              setEditing(!editing);
            }}
            className="text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {row.override != null ? "your amount · edit" : "set amount"}
          </button>
        </div>
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return setError("Enter an amount in dollars.");
            save(n);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-xs text-muted-foreground">Monthly cost</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
            autoFocus
          />
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          {row.override != null && (
            <button type="button" disabled={busy} onClick={() => save(null)} className="h-9 px-2 text-xs font-bold text-muted-foreground hover:text-foreground">
              Use estimate ({formatUsdCents(row.estimated)})
            </button>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </form>
      )}
    </li>
  );
}
