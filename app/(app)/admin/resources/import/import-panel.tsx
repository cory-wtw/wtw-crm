"use client";

import Link from "next/link";
import { useState } from "react";
import {
  parseSeedResource,
  type SeedParse,
  type SeedResource,
} from "@/lib/resource-import";
import { BUCKET_LABELS } from "@/lib/schemas";
import { importResourcesAction, type ImportSummary } from "./actions";

type Preview = {
  raw: SeedResource;
  name: string;
  parsed: SeedParse;
};

/**
 * Pull the records out of whatever shape got pasted.
 *
 * Three shapes are accepted because all three turn up: the whole file with its
 * `resources` array, a bare array, and a single record on its own. Being fussy
 * about the wrapper would mean editing JSON on a touchscreen, which is the
 * thing this screen exists to avoid.
 */
function extractRecords(text: string): SeedResource[] | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `That isn't valid JSON — ${error.message}`
          : "That isn't valid JSON.",
    };
  }

  if (Array.isArray(value)) return value as SeedResource[];
  if (value && typeof value === "object") {
    const wrapped = (value as { resources?: unknown }).resources;
    if (Array.isArray(wrapped)) return wrapped as SeedResource[];
    if ("org_name" in (value as object)) return [value as SeedResource];
  }
  return {
    error:
      'No records found. Expected a "resources" array, a bare array, or one record.',
  };
}

export function ImportPanel() {
  const [text, setText] = useState("");
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function check() {
    setSummary(null);
    setServerError(null);
    const extracted = extractRecords(text);
    if ("error" in extracted) {
      setParseError(extracted.error);
      setPreviews(null);
      return;
    }
    setParseError(null);
    setPreviews(
      extracted.map((raw) => ({
        raw,
        name: raw?.org_name?.trim() || "(unnamed)",
        parsed: parseSeedResource(raw ?? {}),
      })),
    );
  }

  const ready = previews?.filter((p) => p.parsed.ok) ?? [];
  const broken = previews?.filter((p) => !p.parsed.ok) ?? [];

  async function load() {
    setSaving(true);
    setServerError(null);
    try {
      const response = await importResourcesAction(ready.map((p) => p.raw));
      if (!response.ok) {
        setServerError(response.error);
        return;
      }
      setSummary(response.summary);
      setPreviews(null);
    } catch (error) {
      // Say what actually happened. "The request failed" told a person on an
      // iPad nothing they could act on, and there is no console to open on a
      // tablet — so the message on screen has to carry the diagnosis.
      const detail = error instanceof Error ? error.message : String(error);
      setServerError(
        `The request didn't reach the server: ${detail}. If the app was ` +
          `deployed a moment ago, reload the page fully and try again — the ` +
          `page in front of you may be from the previous version.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-bold">
            Loaded {summary.written.length}{" "}
            {summary.written.length === 1 ? "record" : "records"}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {summary.written.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/resources/${row.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {row.organizationName}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  {row.created ? "added" : "updated"}
                </span>
              </li>
            ))}
          </ul>
          {summary.failed.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-bold text-destructive">
                {summary.failed.length} rejected
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {summary.failed.map((row) => (
                  <li key={row.organizationName}>
                    {row.organizationName}: {row.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSummary(null);
            setText("");
          }}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Load another batch
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-bold" htmlFor="json">
          Paste the JSON
        </label>
        <textarea
          id="json"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder='{ "resources": [ { "org_name": "…" } ] }'
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={check}
          disabled={text.trim().length === 0}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Check it
        </button>
      </div>

      {parseError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {parseError}
        </p>
      )}

      {previews && (
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {previews.map((preview, index) => (
              <li key={`${preview.name}-${index}`} className="p-4">
                <p className="text-sm font-bold">{preview.name}</p>
                {preview.parsed.ok ? (
                  <RecordSummary parsed={preview.parsed} />
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs text-destructive">
                    {preview.parsed.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {broken.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {broken.length} {broken.length === 1 ? "record" : "records"}{" "}
              can&rsquo;t load until the values above are fixed. The rest will
              go in without them.
            </p>
          )}

          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}

          <button
            type="button"
            onClick={load}
            disabled={saving || ready.length === 0}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
          >
            {saving
              ? "Loading…"
              : `Load ${ready.length} ${ready.length === 1 ? "record" : "records"}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** The record as it will be stored — this preview is the review. */
function RecordSummary({
  parsed,
}: {
  parsed: Extract<SeedParse, { ok: true }>;
}) {
  const { input } = parsed;
  const gates = [
    input.requiresVaEnrollment && "VA enrollment",
    input.requiresValidId && "valid ID",
    input.requiresDependents && "dependents",
    input.crisisCapable && "same-day capable",
  ].filter(Boolean);

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {input.buckets.map((bucket) => (
          <span
            key={bucket}
            className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
          >
            {BUCKET_LABELS[bucket]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {input.geoScope}
        {input.geoLocalities.length > 0 &&
          ` · ${input.geoLocalities.join(", ")}`}
        {input.geoStates.length > 0 && ` · ${input.geoStates.join(", ")}`}
        {" · "}
        {input.minDischarge} discharge · {input.typicalWait} wait
        {gates.length > 0 && ` · ${gates.join(", ")}`}
      </p>
      <p className="text-xs">
        <span className="font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
          {input.verificationStatus}
        </span>
        {input.verificationStatus === "live" && (
          <span className="text-muted-foreground">
            {" "}
            — offered to veterans as soon as this loads
          </span>
        )}
      </p>
      {parsed.warnings.map((warning) => (
        <p key={warning} className="text-xs text-[color:var(--wtw-deep-gold)]">
          {warning}
        </p>
      ))}
    </div>
  );
}
