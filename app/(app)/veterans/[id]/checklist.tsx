"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CHECKLIST_PRESETS } from "@/lib/schemas";
import {
  addChecklistItemAction,
  removeChecklistItemAction,
  setChecklistItemDoneAction,
} from "../actions";

export type ChecklistRow = {
  id: string;
  label: string;
  done: boolean;
  doneAtIso: string | null;
};

/**
 * What they still need — bus pass, ID, phone, supplies — as checkboxes, so
 * what's open shows at a glance instead of hiding in note text.
 */
export function Checklist({
  veteranId,
  items,
  canManage,
}: {
  veteranId: string;
  items: ChecklistRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const openLabels = new Set(open.map((i) => i.label.toLowerCase()));
  const presets = CHECKLIST_PRESETS.filter((p) => !openLabels.has(p.toLowerCase()));

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Couldn't save — check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (await run(`add:${trimmed}`, () => addChecklistItemAction(veteranId, trimmed))) {
      setLabel("");
    }
  }

  function remove(item: ChecklistRow) {
    if (!confirm(`Take "${item.label}" off the list?`)) return;
    void run(item.id, () => removeChecklistItemAction(veteranId, item.id));
  }

  const disabled = busy !== null || isPending;

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Still needs ({open.length})
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The concrete things to get them — tick each off when it&apos;s in hand.
        </p>
      </div>

      {open.length === 0 && done.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">Nothing on the list yet.</p>
      )}

      <ul className="space-y-1">
        {[...open, ...done].map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canManage || disabled}
                onChange={(e) =>
                  void run(item.id, () =>
                    setChecklistItemDoneAction(veteranId, item.id, e.target.checked),
                  )
                }
                className="size-5 shrink-0 accent-[color:var(--wtw-deep-gold)]"
              />
              <span className={item.done ? "text-muted-foreground line-through" : "font-bold"}>
                {item.label}
              </span>
              {item.done && item.doneAtIso && (
                <span className="text-xs text-muted-foreground">
                  {new Date(item.doneAtIso).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </label>
            {canManage && (
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={disabled}
                className="shrink-0 text-xs font-bold text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void add(p)}
                  disabled={disabled}
                  className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-3 text-sm font-bold transition-colors hover:border-primary disabled:opacity-50"
                >
                  + {p}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add(label);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Something else they need…"
              aria-label="Something else they need"
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={disabled || !label.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
