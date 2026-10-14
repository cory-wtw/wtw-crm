"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  NO_COLUMN,
  buildVendorIndex,
  importIdentity,
  detectColumns,
  extractRows,
  isZeffyPayout,
  matchVendor,
  normalizeVendorText,
  suggestVendorName,
  type ColumnMap,
  type ImportMode,
  type KnownVendor,
  type ParsedRow,
} from "@/lib/finance/bank-import";
import { parseCsv } from "@/lib/finance/csv";
import { formatUsdCents } from "@/lib/format";
import type { Category } from "@/lib/schemas";
import { importTransactionsAction, type ImportResult } from "../actions";

type ReviewRow = ParsedRow & {
  key: string;
  vendor: string;
  categoryId: string;
  include: boolean;
  matched: boolean;
  touched: boolean;
  warning?: string;
};

/** Rows per request; matches the server's limit. */
const CHUNK = 250;

const COLUMN_LABELS: Record<ImportMode, [keyof ColumnMap, string][]> = {
  bank: [
    ["date", "Date"],
    ["description", "Description"],
    ["amount", "Amount (signed)"],
    ["debit", "…or Debit / money out"],
    ["credit", "…and Credit / money in"],
    ["reference", "Reference / ID"],
  ],
  zeffy: [
    ["date", "Payment date"],
    ["amount", "Amount"],
    ["donorFirst", "Donor first name"],
    ["donorLast", "Donor last name"],
    ["campaign", "Campaign / form"],
    ["reference", "Payment ID"],
    ["status", "Status"],
    ["description", "Description (optional)"],
  ],
};

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const primary =
  "inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50";

export function ImportPanel({
  categories,
  known,
}: {
  categories: Category[];
  known: KnownVendor[];
}) {
  const [mode, setMode] = useState<ImportMode>("bank");
  const [text, setText] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [flipSigns, setFlipSigns] = useState(false);
  const [zeffyCategory, setZeffyCategory] = useState(
    () =>
      categories.find((c) => c.type === "income" && /individual/i.test(c.name))?.id ??
      categories.find((c) => c.type === "income")?.id ??
      "",
  );
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const index = useMemo(() => buildVendorIndex(known), [known]);
  const incomeCats = categories.filter((c) => c.type === "income");
  const expenseCats = categories.filter((c) => c.type === "expense");

  function reset() {
    setTable(null);
    setMap(null);
    setRows(null);
    setError(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    reset();
  }

  function readColumns() {
    setError(null);
    setResult(null);
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("That doesn't look like a CSV with a header row and at least one transaction.");
      return;
    }
    setTable(parsed);
    setMap(detectColumns(parsed[0], mode));
    setRows(null);
  }

  function buildPreview() {
    if (!table || !map) return;
    if (map.date === NO_COLUMN || (map.amount === NO_COLUMN && map.debit === NO_COLUMN && map.credit === NO_COLUMN)) {
      setError("Pick at least a date column and an amount column.");
      return;
    }
    setError(null);
    const { rows: parsed, errors } = extractRows(table, map, { mode, flipSigns });
    if (errors.length > 0 && parsed.length === 0) {
      setError(`Couldn't read any rows. First problem — line ${errors[0].line}: ${errors[0].message}`);
      return;
    }
    setRows(
      parsed.map((r, i) => {
        const key = `${r.line}-${i}`;
        if (mode === "zeffy") {
          return {
            ...r,
            key,
            vendor: "Zeffy",
            categoryId: zeffyCategory,
            include: true,
            matched: true,
            touched: false,
            warning:
              r.amount < 0
                ? "Refund. Make sure the original gift is in this file or already imported, or the refund will push income below what was received."
                : undefined,
          };
        }
        const hit = matchVendor(r.description, r.type, index);
        const payout = isZeffyPayout(r);
        return {
          ...r,
          key,
          vendor: hit?.vendor ?? suggestVendorName(r.description),
          categoryId: hit?.categoryId ?? "",
          include: !payout,
          matched: !!hit,
          touched: false,
          warning: payout
            ? "Looks like a Zeffy payout. If you import Zeffy donations separately, this would count them twice."
            : undefined,
        };
      }),
    );
    setFilter(mode === "zeffy" ? "all" : "review");
    if (errors.length > 0) {
      setError(
        `${errors.length} line(s) skipped: ` +
          errors.slice(0, 3).map((e) => `line ${e.line} (${e.message})`).join(", ") +
          (errors.length > 3 ? "…" : ""),
      );
    }
  }

  /** Edit one row, and carry a vendor/category choice to its unlabelled twins. */
  function update(key: string, patch: Partial<Pick<ReviewRow, "vendor" | "categoryId" | "include">>) {
    setRows((prev) => {
      if (!prev) return prev;
      const target = prev.find((r) => r.key === key);
      if (!target) return prev;
      const twin = normalizeVendorText(target.description);
      return prev.map((r) => {
        if (r.key === key) return { ...r, ...patch, touched: true };
        const propagate =
          mode === "bank" &&
          !r.matched &&
          !r.touched &&
          r.type === target.type &&
          twin !== "" &&
          normalizeVendorText(r.description) === twin &&
          (patch.vendor !== undefined || patch.categoryId !== undefined);
        if (!propagate) return r;
        return {
          ...r,
          ...(patch.vendor !== undefined ? { vendor: patch.vendor } : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        };
      });
    });
  }

  const included = rows?.filter((r) => r.include) ?? [];
  const missing = included.filter((r) => !r.categoryId);
  const visible =
    rows?.filter((r) => filter === "all" || !r.matched || !r.categoryId || r.warning) ?? [];
  const totals = included.reduce(
    (t, r) => {
      const c = Math.round(r.amount * 100);
      if (r.type === "income") t.in += c;
      else t.out += c;
      return t;
    },
    { in: 0, out: 0 },
  );

  async function submit() {
    setSaving(true);
    setError(null);
    // Number twins across the whole file (included or not, so unticking a
    // row doesn't renumber its twin), then send in chunks small enough for
    // the server-action body limit.
    const seen = new Map<string, number>();
    const occurrence = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = importIdentity(mode, r);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      occurrence.set(r.key, n);
    }
    const payload = included.map((r) => ({
      date: r.date,
      description: r.description,
      vendor: r.vendor.trim(),
      amount: r.amount,
      type: r.type,
      categoryId: r.categoryId,
      donorName: r.donorName,
      campaign: r.campaign,
      reference: r.reference,
      occurrence: occurrence.get(r.key) ?? 0,
    }));
    const done: ImportResult = { created: 0, duplicates: 0 };
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const response = await importTransactionsAction({
          mode,
          rows: payload.slice(i, i + CHUNK),
        });
        if (!response.ok) {
          setError(
            (i > 0 ? `Imported ${done.created} before stopping. Re-running the import is safe. ` : "") +
              response.error,
          );
          return;
        }
        done.created += response.created;
        done.duplicates += response.duplicates;
      }
      setResult(done);
      setText("");
      reset();
    } catch (e) {
      setError(
        `The request didn't reach the server: ${e instanceof Error ? e.message : String(e)}. Reload the page and try again.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-bold">
          Imported {result.created} transaction{result.created === 1 ? "" : "s"}.
        </p>
        {result.duplicates > 0 && (
          <p className="text-xs text-muted-foreground">
            {result.duplicates} already on file from an earlier import — skipped.
          </p>
        )}
        <div className="flex gap-3">
          <Link href="/finances/transactions" className={primary}>
            View transactions
          </Link>
          <button type="button" onClick={() => setResult(null)} className="text-sm font-bold text-muted-foreground hover:text-foreground">
            Import another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="inline-flex rounded-md border border-border bg-card p-1">
          {(["bank", "zeffy"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={`h-9 rounded px-4 text-sm font-bold ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "bank" ? "Bank statement" : "Zeffy donations"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "bank"
            ? "Download transactions from online banking as CSV. Any bank's layout works — you'll confirm which column is which."
            : "In Zeffy: Payments → Export. Each payment becomes one income row tagged with the donor and campaign."}
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-sm file:font-bold"
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            reset();
          }}
          rows={6}
          placeholder="…or paste the CSV here"
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {!table && (
          <button type="button" onClick={readColumns} disabled={!text.trim()} className={primary}>
            Read file
          </button>
        )}
      </section>

      {table && map && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Columns
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLUMN_LABELS[mode].map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-bold">
                <span>{label}</span>
                <select
                  value={map[key]}
                  onChange={(e) => {
                    setMap({ ...map, [key]: Number(e.target.value) });
                    setRows(null);
                  }}
                  className={control}
                >
                  <option value={NO_COLUMN}>—</option>
                  {table[0].map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`} {table[1]?.[i] ? `(e.g. ${table[1][i].slice(0, 24)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {mode === "bank" && map.amount !== NO_COLUMN && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={flipSigns} onChange={(e) => { setFlipSigns(e.target.checked); setRows(null); }} className="size-4" />
              Purchases are positive numbers in this file (common for credit cards)
            </label>
          )}
          {mode === "zeffy" && (
            <label className="block max-w-sm space-y-1 text-xs font-bold">
              <span>File every donation under</span>
              <select value={zeffyCategory} onChange={(e) => { setZeffyCategory(e.target.value); setRows(null); }} className={control}>
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          {!rows && (
            <button type="button" onClick={buildPreview} className={primary}>
              Preview {table.length - 1} rows
            </button>
          )}
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
              Review
            </h2>
            <span className="text-xs text-muted-foreground">
              {rows.filter((r) => r.matched).length} matched · {rows.filter((r) => !r.matched).length} new ·{" "}
              in {formatUsdCents(totals.in / 100)} · out {formatUsdCents(totals.out / 100)}
            </span>
            <div className="ml-auto inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
              {(["review", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded px-3 py-1 font-bold ${filter === f ? "bg-secondary" : "text-muted-foreground"}`}
                >
                  {f === "review" ? "Needs review" : `All ${rows.length}`}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Everything matched a known vendor. Switch to &ldquo;All&rdquo; to double-check, or import.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {visible.map((r) => (
                <li key={r.key} className={`space-y-2 p-3 ${r.include ? "" : "opacity-50"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                      className="mt-1 size-4"
                      aria-label="Include"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="tabular-nums text-muted-foreground">{r.date}</span>{" "}
                        <span className="font-bold">{r.donorName ?? r.description}</span>
                        {r.campaign && <span className="text-muted-foreground"> · {r.campaign}</span>}
                      </p>
                      {!r.matched && (
                        <span className="mt-0.5 inline-block rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
                          New vendor
                        </span>
                      )}
                      {r.warning && <p className="mt-1 text-xs text-destructive">{r.warning}</p>}
                    </div>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${r.type === "income" && r.amount > 0 ? "text-[color:var(--wtw-deep-gold)]" : ""}`}>
                      {r.type === "income" && r.amount > 0 ? "+" : "−"}
                      {formatUsdCents(Math.abs(r.amount))}
                    </span>
                  </div>
                  {mode === "bank" && (
                    <div className="grid gap-2 pl-7 sm:grid-cols-2">
                      <input
                        value={r.vendor}
                        onChange={(e) => update(r.key, { vendor: e.target.value })}
                        placeholder="Vendor"
                        aria-label="Vendor"
                        className={control}
                      />
                      <select
                        value={r.categoryId}
                        onChange={(e) => update(r.key, { categoryId: e.target.value })}
                        aria-label="Category"
                        className={`${control} ${r.include && !r.categoryId ? "border-destructive" : ""}`}
                      >
                        <option value="">Pick a category…</option>
                        <optgroup label={r.type === "income" ? "Income" : "Expense"}>
                          {(r.type === "income" ? incomeCats : expenseCats).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label={r.type === "income" ? "Refund of an expense" : "Reversal of income"}>
                          {(r.type === "income" ? expenseCats : incomeCats).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button type="button" onClick={submit} disabled={saving || included.length === 0 || missing.length > 0} className={primary}>
              {saving ? "Importing…" : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
            </button>
            {missing.length > 0 && (
              <span className="text-xs text-destructive">
                {missing.length} row{missing.length === 1 ? " needs" : "s need"} a category (or untick to skip).
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
