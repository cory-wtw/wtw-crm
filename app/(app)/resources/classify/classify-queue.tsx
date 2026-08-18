"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BUCKET_CODES,
  BUCKET_LABELS,
  GEO_SCOPES,
  GEO_SCOPE_LABELS,
  type Bucket,
  type GeoScope,
  type ResourceInput,
} from "@/lib/schemas";
import { editResourceAction } from "../actions";

export type ClassifyItem = {
  id: string;
  organizationName: string;
  description: string | null;
  services: string | null;
  eligibility: string | null;
  website: string | null;
  /** The complete record, so a save doesn't drop what isn't on this screen. */
  input: ResourceInput;
};

/** "TN, ga , Al" -> ["TN", "GA", "AL"] */
function splitList(value: string, upper = false): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (upper ? part.toUpperCase() : part));
}

function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function ClassifyQueue({ queue }: { queue: ClassifyItem[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const item = queue[index];

  // Per-item edits, keyed by id so moving back and forth doesn't lose work.
  const [edits, setEdits] = useState<
    Record<
      string,
      { buckets: Bucket[]; geoScope: GeoScope; states: string; localities: string }
    >
  >({});

  const current = item
    ? (edits[item.id] ?? {
        buckets: item.input.buckets,
        geoScope: item.input.geoScope,
        states: item.input.geoStates.join(", "),
        localities: item.input.geoLocalities.join(", "),
      })
    : null;

  function update(patch: Partial<NonNullable<typeof current>>) {
    if (!item || !current) return;
    setEdits((all) => ({ ...all, [item.id]: { ...current, ...patch } }));
  }

  function toggleBucket(bucket: Bucket) {
    if (!current) return;
    update({
      buckets: current.buckets.includes(bucket)
        ? current.buckets.filter((b) => b !== bucket)
        : [...current.buckets, bucket],
    });
  }

  function advance() {
    setError(null);
    setIndex((i) => i + 1);
  }

  async function save() {
    if (!item || !current) return;
    setError(null);
    setSaving(true);
    try {
      const needsStates = current.geoScope !== "national";
      const needsLocalities = current.geoScope === "local";

      // The whole record goes back, with only the classification fields
      // changed — editResourceAction validates and writes the full input.
      const response = await editResourceAction(item.id, {
        ...item.input,
        buckets: current.buckets,
        geoScope: current.geoScope,
        geoStates: needsStates ? splitList(current.states, true) : [],
        geoLocalities: needsLocalities ? splitList(current.localities) : [],
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setDone((ids) => [...ids, item.id]);
      // The list this queue came from is now stale by one record.
      router.refresh();
      advance();
    } finally {
      setSaving(false);
    }
  }

  if (!item || !current) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm font-bold">
            {done.length === 0
              ? "Nothing left in this pass."
              : `Classified ${done.length} of ${queue.length}.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done.length === queue.length
              ? "That's the whole backlog."
              : "Anything you skipped is still waiting — reload to pick it up again."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/resources"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Back to the directory
          </Link>
          {done.length < queue.length && (
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setError(null);
              }}
              className="text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              Start again from the top
            </button>
          )}
        </div>
      </div>
    );
  }

  const needsStates = current.geoScope !== "national";
  const needsLocalities = current.geoScope === "local";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          {index + 1} of {queue.length} · {done.length} saved
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-[color:var(--wtw-brand-gold)] transition-all"
            style={{ width: `${(index / queue.length) * 100}%` }}
          />
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">
            {item.organizationName}
          </h2>
          <Link
            href={`/resources/${item.id}`}
            target="_blank"
            className="text-xs font-bold text-muted-foreground underline-offset-4 hover:underline"
          >
            Open the full record
          </Link>
        </div>

        {item.website && (
          <a
            href={websiteHref(item.website)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
          >
            {item.website.replace(/^https?:\/\//i, "")}
          </a>
        )}

        {item.description && (
          <p className="whitespace-pre-wrap text-sm">{item.description}</p>
        )}
        {item.services && (
          <p className="text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Services{" "}
            </span>
            {item.services}
          </p>
        )}
        {item.eligibility && (
          <p className="text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Eligibility{" "}
            </span>
            {item.eligibility}
          </p>
        )}
        {!item.description && !item.services && !item.eligibility && (
          <p className="text-sm text-muted-foreground">
            Nothing written down about this one. Open the website, or skip it
            and come back.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          What needs does it serve?
        </h3>
        <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2">
          {BUCKET_CODES.map((bucket) => (
            <label key={bucket} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={current.buckets.includes(bucket)}
                onChange={() => toggleBucket(bucket)}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              {BUCKET_LABELS[bucket]}
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold">Service area</label>
          <select
            value={current.geoScope}
            onChange={(e) => update({ geoScope: e.target.value as GeoScope })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {GEO_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {GEO_SCOPE_LABELS[scope]}
              </option>
            ))}
          </select>
        </div>

        {needsStates ? (
          <div className="space-y-1.5">
            <label className="block text-sm font-bold">
              States served <span className="text-destructive">*</span>
            </label>
            <input
              value={current.states}
              onChange={(e) => update({ states: e.target.value })}
              placeholder="TN, GA"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Two-letter codes, comma separated.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-sm font-bold">States served</label>
            <p className="rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              Everywhere
            </p>
          </div>
        )}

        {needsLocalities && (
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-sm font-bold">
              Cities or counties served{" "}
              <span className="text-destructive">*</span>
            </label>
            <input
              value={current.localities}
              onChange={(e) => update({ localities: e.target.value })}
              placeholder="Chattanooga, East Ridge"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              A veteran&rsquo;s city is matched against this list, so name the
              cities, not just the county.
            </p>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <button
          type="button"
          onClick={save}
          disabled={saving || current.buckets.length === 0}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : index + 1 === queue.length
              ? "Save and finish"
              : "Save and next"}
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={saving}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
        {current.buckets.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Pick at least one need — a record with none can&rsquo;t be offered
            to anybody.
          </p>
        )}
      </div>
    </div>
  );
}
