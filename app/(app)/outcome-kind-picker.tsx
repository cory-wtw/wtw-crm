"use client";

import {
  BUCKET_CODES,
  BUCKET_LABELS,
  OUTCOME_KINDS,
  OUTCOME_KIND_INFO,
  OUTCOME_VALUE_PROMPTS,
  type OutcomeKind,
} from "@/lib/schemas";

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** Kinds grouped under the same need buckets intake uses, "Something else"
 *  last. */
const GROUPS = [
  ...BUCKET_CODES.map((bucket) => ({
    label: BUCKET_LABELS[bucket],
    kinds: OUTCOME_KINDS.filter((k) => OUTCOME_KIND_INFO[k].bucket === bucket),
  })),
  {
    label: "Other",
    kinds: OUTCOME_KINDS.filter((k) => OUTCOME_KIND_INFO[k].bucket === null),
  },
].filter((g) => g.kinds.length > 0);

/**
 * "What did they get?" plus, when the kind has a dollar figure, how much.
 * Shared by the Log a win form and the follow-up form so both ask the same
 * question the same way.
 */
export function OutcomeKindPicker({
  kind,
  amount,
  onKind,
  onAmount,
  optional = true,
}: {
  kind: OutcomeKind | "";
  amount: string;
  onKind: (kind: OutcomeKind | "") => void;
  onAmount: (amount: string) => void;
  optional?: boolean;
}) {
  const value = kind ? OUTCOME_KIND_INFO[kind].value : null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1.5">
        <span className="block text-sm font-bold">
          What did they get?{optional && (
            <span className="font-normal text-muted-foreground"> (optional)</span>
          )}
        </span>
        <select
          value={kind}
          onChange={(e) => onKind(e.target.value as OutcomeKind | "")}
          className={inputClass}
        >
          <option value="">Pick one…</option>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.kinds.map((k) => (
                <option key={k} value={k}>
                  {OUTCOME_KIND_INFO[k].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {value && (
        <label className="space-y-1.5">
          <span className="block text-sm font-bold">
            {OUTCOME_VALUE_PROMPTS[value]}
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              placeholder={value === "monthly" ? "per month" : "total"}
              className={`${inputClass} pl-7`}
            />
          </div>
        </label>
      )}
    </div>
  );
}
