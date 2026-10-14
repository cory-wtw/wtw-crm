"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Category, TransactionType } from "@/lib/schemas";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

type Draft = {
  name: string;
  type: TransactionType;
  program: string;
  mgmt: string;
  fundraising: string;
};

const toDraft = (c: Category): Draft => ({
  name: c.name,
  type: c.type,
  program: String(c.defaultProgramPct),
  mgmt: String(c.defaultMgmtPct),
  fundraising: String(c.defaultFundraisingPct),
});

const EMPTY: Draft = { name: "", type: "expense", program: "100", mgmt: "0", fundraising: "0" };

const cellInput =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function CategoriesEditor({
  categories,
  counts,
}: {
  categories: Category[];
  counts: Record<string, number>;
}) {
  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");
  return (
    <div className="space-y-8">
      <Group title="Expense categories" rows={expense} counts={counts} showSplit />
      <Group title="Income categories" rows={income} counts={counts} showSplit={false} />
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Add a category
        </h2>
        <div className="rounded-lg border border-border bg-card p-3">
          <CategoryRow initial={EMPTY} id={null} count={0} showSplit showType />
        </div>
      </section>
    </div>
  );
}

function Group({
  title,
  rows,
  counts,
  showSplit,
}: {
  title: string;
  rows: Category[];
  counts: Record<string, number>;
  showSplit: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
        {title}
      </h2>
      {showSplit && (
        <div className="hidden grid-cols-[1fr_5rem_5rem_5rem_auto] gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground sm:grid">
          <span>Name</span>
          <span>Program %</span>
          <span>Mgmt %</span>
          <span>Fund. %</span>
          <span className="w-36" />
        </div>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((c) => (
          <li key={c.id} className="p-3">
            <CategoryRow initial={toDraft(c)} id={c.id} count={counts[c.id] ?? 0} showSplit={showSplit} />
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-3 text-xs text-muted-foreground">None yet.</li>
        )}
      </ul>
    </section>
  );
}

function CategoryRow({
  initial,
  id,
  count,
  showSplit,
  showType,
}: {
  initial: Draft;
  id: string | null;
  count: number;
  showSplit: boolean;
  showType?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const split = showSplit && draft.type === "expense";
  const sum = Number(draft.program) + Number(draft.mgmt) + Number(draft.fundraising);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save() {
    setError(null);
    setBusy(true);
    const result = await saveCategoryAction(id, {
      name: draft.name,
      type: draft.type,
      // Income isn't functionally allocated; store a neutral 100/0/0.
      defaultProgramPct: draft.type === "expense" ? Number(draft.program) : 100,
      defaultMgmtPct: draft.type === "expense" ? Number(draft.mgmt) : 0,
      defaultFundraisingPct: draft.type === "expense" ? Number(draft.fundraising) : 0,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!id) setDraft(EMPTY);
    startTransition(() => router.refresh());
  }

  async function remove() {
    if (!id || !window.confirm(`Delete "${initial.name}"?`)) return;
    setError(null);
    setBusy(true);
    const result = await deleteCategoryAction(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1">
      <div className={`grid items-center gap-2 ${split ? "sm:grid-cols-[1fr_5rem_5rem_5rem_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <div className="flex gap-2">
          <input value={draft.name} onChange={set("name")} placeholder="Category name" className={cellInput} aria-label="Name" />
          {showType && (
            <select value={draft.type} onChange={set("type")} className={`${cellInput} w-32`} aria-label="Type">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          )}
        </div>
        {split && (
          <div className="grid grid-cols-3 gap-2 sm:contents">
            <input type="number" min="0" max="100" value={draft.program} onChange={set("program")} className={cellInput} aria-label="Program %" />
            <input type="number" min="0" max="100" value={draft.mgmt} onChange={set("mgmt")} className={cellInput} aria-label="Management %" />
            <input type="number" min="0" max="100" value={draft.fundraising} onChange={set("fundraising")} className={cellInput} aria-label="Fundraising %" />
          </div>
        )}
        <div className="flex w-36 items-center justify-end gap-2">
          {id && <span className="text-xs text-muted-foreground">{count} txns</span>}
          {(dirty || !id) && (
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.name.trim() || (split && Math.abs(sum - 100) > 0.01)}
              className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              {id ? "Save" : "Add"}
            </button>
          )}
          {id && !dirty && count === 0 && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="h-9 rounded-md border border-destructive/40 px-3 text-xs font-bold text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {split && Math.abs(sum - 100) > 0.01 && (
        <p className="text-xs text-destructive">Adds up to {sum}% — needs to be 100%.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
