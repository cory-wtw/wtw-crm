"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  OUTCOME_KIND_INFO,
  outcomeSummary,
  WTW_ROLES,
  WTW_ROLE_LABELS,
  WTW_ROLE_TAGS,
  type OutcomeKind,
  type WtwRole,
} from "@/lib/schemas";
import { localTodayIso as todayIso, positiveAmount } from "@/lib/utils";
import { OutcomeKindPicker } from "../../outcome-kind-picker";
import {
  logOutcomeAction,
  removeOutcomeAction,
  setOutcomeRoleAction,
} from "../actions";

export type OutcomeItem = {
  id: string;
  kind: OutcomeKind;
  achievedAtIso: string;
  monthlyValue?: number;
  oneTimeValue?: number;
  resourceName?: string;
  wtwRole?: WtwRole;
  note?: string;
};

/**
 * "Did WTW help?" as three buttons. Required on a new win; on an old one it's
 * how somebody answers after the fact.
 */
function WtwRolePicker({
  value,
  onChange,
  disabled,
}: {
  value: WtwRole | "";
  onChange: (role: WtwRole) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Did WTW help?">
      {WTW_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          disabled={disabled}
          onClick={() => onChange(role)}
          className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-bold transition-colors disabled:opacity-50 ${
            value === role
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:border-primary"
          }`}
        >
          {WTW_ROLE_LABELS[role]}
        </button>
      ))}
    </div>
  );
}

/**
 * Wins beyond VA benefits — the job, the apartment, the SNAP card. One tap to
 * open, one pick, an optional dollar figure, done.
 */
export function Outcomes({
  veteranId,
  items,
  canManage,
}: {
  veteranId: string;
  items: OutcomeItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<OutcomeKind | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [wtwRole, setWtwRole] = useState<WtwRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setExpanded(false);
    setKind("");
    setAmount("");
    setDate(todayIso());
    setNote("");
    setWtwRole("");
    setError(null);
  }

  async function answer(item: OutcomeItem, role: WtwRole) {
    if (removing) return;
    setRemoving(item.id);
    try {
      const result = await setOutcomeRoleAction(veteranId, item.id, role);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      alert("Couldn't save — check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) {
      setError("Pick what they got.");
      return;
    }
    if (!wtwRole) {
      setError("Say whether WTW helped. The Impact report only counts the wins we had a hand in.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await logOutcomeAction(veteranId, {
        kind,
        achievedAt: `${date}T12:00:00`,
        amount: positiveAmount(amount),
        wtwRole,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save — check your connection, then refresh to see whether it went through.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: OutcomeItem) {
    if (removing) return;
    if (!confirm(`Remove "${OUTCOME_KIND_INFO[item.kind].label}"?`)) return;
    setRemoving(item.id);
    try {
      const result = await removeOutcomeAction(veteranId, item.id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      alert("Couldn't remove it — check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  const sorted = [...items].sort((a, b) =>
    b.achievedAtIso.localeCompare(a.achievedAtIso),
  );

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Wins ({items.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Anything beyond VA benefits — a job, housing, SNAP, an ID.
          </p>
        </div>
        {canManage && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Log a win
          </button>
        )}
      </div>

      {expanded && (
        <form
          onSubmit={submit}
          className="mb-4 space-y-4 rounded-lg border border-border bg-background p-4"
        >
          <OutcomeKindPicker
            kind={kind}
            amount={amount}
            onKind={setKind}
            onAmount={setAmount}
            optional={false}
          />
          <div className="space-y-1.5">
            <span className="block text-sm font-bold">Did WTW help?</span>
            <WtwRolePicker value={wtwRole} onChange={setWtwRole} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-bold">When</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-bold">
                Details{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Forklift operator at Home Depot"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || isPending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
            >
              {saving || isPending ? "Saving…" : "Save win"}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No wins logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 border-l-2 border-[color:var(--wtw-brand-gold)] pl-4"
            >
              <div className="text-sm">
                <p>{outcomeSummary(item)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.achievedAtIso).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · "}
                  <span
                    className={
                      item.wtwRole
                        ? undefined
                        : "font-bold text-[color:var(--wtw-deep-gold)]"
                    }
                  >
                    {WTW_ROLE_TAGS[item.wtwRole ?? "unconfirmed"]}
                  </span>
                </p>
                {!item.wtwRole && canManage && (
                  <div className="mt-2">
                    <WtwRolePicker
                      value=""
                      onChange={(role) => answer(item, role)}
                      disabled={removing !== null}
                    />
                  </div>
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={removing !== null}
                  className="shrink-0 disabled:opacity-50 text-xs font-bold text-muted-foreground hover:text-destructive"
                >
                  {removing === item.id ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
