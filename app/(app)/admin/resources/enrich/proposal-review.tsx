"use client";

import { useState } from "react";
import { proposalToInput } from "@/lib/enrich";
import {
  ACCESS_METHOD_LABELS,
  ACCESS_METHODS,
  BUCKET_CODES,
  BUCKET_LABELS,
  CLASSIFICATION_GAP_LABELS,
  classificationGaps,
  GEO_SCOPE_LABELS,
  GEO_SCOPES,
  MIN_DISCHARGE_LABELS,
  MIN_DISCHARGES,
  TYPICAL_WAIT_LABELS,
  TYPICAL_WAITS,
  type AccessMethod,
  type Bucket,
  type GeoScope,
  type MinDischarge,
  type TypicalWait,
} from "@/lib/schemas";
import { approveProposalAction, type EnrichResult } from "./actions";

type Draft = {
  organizationName: string;
  parentOrg: string;
  description: string;
  website: string;
  buckets: Bucket[];
  geoScope: GeoScope;
  geoStates: string;
  geoLocalities: string;
  minDischarge: MinDischarge;
  requiresVaEnrollment: boolean;
  requiresValidId: boolean;
  requiresDependents: boolean;
  crisisCapable: boolean;
  accessMethod: AccessMethod;
  accessValue: string;
  whatToBring: string;
  typicalWait: TypicalWait;
};

function splitList(value: string, upper = false): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (upper ? part.toUpperCase() : part));
}

/**
 * Seed the form from the proposal, through the same null-to-default mapping the
 * script writes with — so what a reviewer sees pre-filled and what an unattended
 * batch stores are the same thing.
 *
 * Every field that fell back is marked "page didn't say" on screen, so a
 * default is never mistaken for a finding. The permissive direction matters: an
 * unanswered gate defaulting to `true` would hide the resource from veterans on
 * a fact nobody established.
 */
function toDraft(result: EnrichResult): Draft {
  const input = proposalToInput(result.proposal, result.url);
  return {
    organizationName: input.organizationName,
    parentOrg: input.parentOrg ?? "",
    description: input.description ?? "",
    website: input.website,
    buckets: input.buckets,
    geoScope: input.geoScope,
    geoStates: input.geoStates.join(", "),
    geoLocalities: input.geoLocalities.join(", "),
    minDischarge: input.minDischarge,
    requiresVaEnrollment: input.requiresVaEnrollment,
    requiresValidId: input.requiresValidId,
    requiresDependents: input.requiresDependents,
    crisisCapable: input.crisisCapable,
    accessMethod: input.accessMethod,
    accessValue: input.accessValue ?? "",
    whatToBring: input.whatToBring ?? "",
    typicalWait: input.typicalWait,
  };
}

export function ProposalReview({
  result,
  onApproved,
  onDiscard,
  onBack,
}: {
  result: EnrichResult;
  onApproved: (resourceId: string) => void;
  onDiscard: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(result));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unanswered = new Set(result.unanswered);
  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const needsStates = draft.geoScope !== "national";
  const needsLocalities = draft.geoScope === "local";

  const gaps = classificationGaps({
    buckets: draft.buckets,
    geoScope: draft.geoScope,
    geoStates: splitList(draft.geoStates, true),
    geoLocalities: splitList(draft.geoLocalities),
  });

  async function approve() {
    setError(null);
    setSaving(true);
    try {
      const response = await approveProposalAction(
        {
          organizationName: draft.organizationName,
          parentOrg: draft.parentOrg || undefined,
          website: draft.website || undefined,
          description: draft.description || undefined,
          buckets: draft.buckets,
          geoScope: draft.geoScope,
          geoStates: needsStates ? splitList(draft.geoStates, true) : [],
          geoLocalities: needsLocalities
            ? splitList(draft.geoLocalities)
            : [],
          minDischarge: draft.minDischarge,
          requiresVaEnrollment: draft.requiresVaEnrollment,
          requiresValidId: draft.requiresValidId,
          eraRestriction: [],
          requiresDependents: draft.requiresDependents,
          crisisCapable: draft.crisisCapable,
          accessMethod: draft.accessMethod,
          accessValue: draft.accessValue || undefined,
          whatToBring: draft.whatToBring || undefined,
          typicalWait: draft.typicalWait,
          verificationStatus: "flagged",
          fragility: "fragile",
        },
        result.externalId,
      );
      if (!response.ok) {
        setError(response.error);
        return;
      }
      onApproved(response.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight">
            {draft.organizationName || "Untitled draft"}
          </h2>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {result.url}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to the list
        </button>
      </div>

      {result.existingResourceId && (
        <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
          This page is already in the directory. Approving updates that record
          rather than adding a second one.
        </p>
      )}

      {result.unanswered.length > 0 && (
        <div className="rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-deep-gold)]/10 p-4 text-sm">
          <p className="font-bold">
            The page didn&rsquo;t answer {result.unanswered.length} field
            {result.unanswered.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-muted-foreground">
            Marked below. They&rsquo;re sitting at the permissive default, which
            is a placeholder and not a finding — set them yourself, or leave
            them open rather than guessing.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field label="Name" unanswered={unanswered.has("name")}>
            <Input
              value={draft.organizationName}
              onChange={(v) => update({ organizationName: v })}
            />
          </Field>

          <Field
            label="Parent organization"
            unanswered={unanswered.has("parentOrg")}
          >
            <Input
              value={draft.parentOrg}
              onChange={(v) => update({ parentOrg: v })}
            />
          </Field>

          <Field label="Description" unanswered={unanswered.has("description")}>
            <textarea
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={3}
              className={inputClasses}
            />
          </Field>

          <Field label="Needs served" unanswered={unanswered.has("buckets")}>
            <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2">
              {BUCKET_CODES.map((bucket) => (
                <label key={bucket} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.buckets.includes(bucket)}
                    onChange={() =>
                      update({
                        buckets: draft.buckets.includes(bucket)
                          ? draft.buckets.filter((b) => b !== bucket)
                          : [...draft.buckets, bucket],
                      })
                    }
                    className="accent-[color:var(--wtw-brand-gold)]"
                  />
                  {BUCKET_LABELS[bucket]}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Service area" unanswered={unanswered.has("geoScope")}>
            <Select
              value={draft.geoScope}
              onChange={(v) => update({ geoScope: v as GeoScope })}
              options={GEO_SCOPES.map((s) => ({
                value: s,
                label: GEO_SCOPE_LABELS[s],
              }))}
            />
          </Field>

          {needsStates && (
            <Field label="States" unanswered={unanswered.has("geoStates")}>
              <Input
                value={draft.geoStates}
                onChange={(v) => update({ geoStates: v })}
                placeholder="TN, GA"
              />
            </Field>
          )}

          {needsLocalities && (
            <Field
              label="Cities or counties"
              unanswered={unanswered.has("geoLocalities")}
            >
              <Input
                value={draft.geoLocalities}
                onChange={(v) => update({ geoLocalities: v })}
                placeholder="Chattanooga, East Ridge"
              />
            </Field>
          )}

          <Field
            label="Minimum discharge"
            unanswered={unanswered.has("minDischarge")}
          >
            <Select
              value={draft.minDischarge}
              onChange={(v) => update({ minDischarge: v as MinDischarge })}
              options={MIN_DISCHARGES.map((m) => ({
                value: m,
                label: MIN_DISCHARGE_LABELS[m],
              }))}
            />
          </Field>

          <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2">
            <Toggle
              label="Requires VA enrollment"
              checked={draft.requiresVaEnrollment}
              unanswered={unanswered.has("requiresVaEnrollment")}
              onChange={(v) => update({ requiresVaEnrollment: v })}
            />
            <Toggle
              label="Requires a valid ID"
              checked={draft.requiresValidId}
              unanswered={unanswered.has("requiresValidId")}
              onChange={(v) => update({ requiresValidId: v })}
            />
            <Toggle
              label="Requires dependents"
              checked={draft.requiresDependents}
              unanswered={unanswered.has("requiresDependents")}
              onChange={(v) => update({ requiresDependents: v })}
            />
            <Toggle
              label="Same-day / crisis capable"
              checked={draft.crisisCapable}
              unanswered={unanswered.has("crisisCapable")}
              onChange={(v) => update({ crisisCapable: v })}
            />
          </div>

          <Field
            label="Access method"
            unanswered={unanswered.has("accessMethod")}
          >
            <Select
              value={draft.accessMethod}
              onChange={(v) => update({ accessMethod: v as AccessMethod })}
              options={ACCESS_METHODS.map((m) => ({
                value: m,
                label: ACCESS_METHOD_LABELS[m],
              }))}
            />
          </Field>

          <Field
            label="How to start"
            unanswered={unanswered.has("accessValue")}
          >
            <Input
              value={draft.accessValue}
              onChange={(v) => update({ accessValue: v })}
            />
          </Field>

          <Field
            label="What to bring"
            unanswered={unanswered.has("whatToBring")}
          >
            <Input
              value={draft.whatToBring}
              onChange={(v) => update({ whatToBring: v })}
            />
          </Field>

          <Field label="Typical wait" unanswered={unanswered.has("typicalWait")}>
            <Select
              value={draft.typicalWait}
              onChange={(v) => update({ typicalWait: v as TypicalWait })}
              options={TYPICAL_WAITS.map((w) => ({
                value: w,
                label: TYPICAL_WAIT_LABELS[w],
              }))}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            What the model read
          </p>
          <pre className="mobile-touch-scroll max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-xs leading-relaxed">
            {result.pageText}
          </pre>
          <p className="text-xs text-muted-foreground">
            This is the page text as extracted, not the live page. If a field
            looks wrong, it&rsquo;s here or it was invented.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <button
          type="button"
          onClick={approve}
          disabled={
            saving || gaps.length > 0 || draft.organizationName.trim() === ""
          }
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Keep as a flagged record"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Discard
        </button>
        {gaps.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Still missing:{" "}
            {gaps
              .map((gap) => CLASSIFICATION_GAP_LABELS[gap].toLowerCase())
              .join(", ")}
            .
          </p>
        )}
      </div>
    </div>
  );
}

const inputClasses =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  unanswered,
  children,
}: {
  label: string;
  unanswered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="block text-sm font-bold">{label}</label>
        {unanswered && <UnansweredTag />}
      </div>
      {children}
    </div>
  );
}

/** Marks a field the page didn't answer, so a default never reads as a fact. */
function UnansweredTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
      Page didn&rsquo;t say
    </span>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClasses}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClasses}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  checked,
  unanswered,
  onChange,
}: {
  label: string;
  checked: boolean;
  unanswered?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[color:var(--wtw-brand-gold)]"
      />
      <span>
        {label}
        {unanswered && (
          <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
            · page didn&rsquo;t say
          </span>
        )}
      </span>
    </label>
  );
}
