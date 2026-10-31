/**
 * Planning for Claude change requests. Pure: no I/O, so the same function that
 * builds a request when Claude proposes it re-checks it when an admin approves
 * it (lib/change-requests-apply.ts), and both are unit-tested here.
 *
 * Every plan runs the proposal through the same input schema and tidy pass as
 * the hand-edit forms, so an approved change can't store anything a person
 * couldn't have typed.
 */

import { computeDiff } from "./audit-diff";
import { tidyResource, tidyVeteran } from "./tidy";
import {
  derivedVerificationStatus,
  type VerificationStatus,
  encounterInputSchema,
  resourceInputSchema,
  transactionInputSchema,
  veteranInputSchema,
  vsoInputSchema,
  type FieldChanges,
} from "./schemas";

/** The veteran fields a change request may set — the edit form's fields. */
export const VETERAN_FIELDS = [
  "firstName",
  "lastInitial",
  "preferredContact",
  "phone",
  "email",
  "hardToReach",
  "contactNotes",
  "birthYear",
  "city",
  "state",
  "zip",
  "dischargeCharacter",
  "serviceEra",
  "idStatus",
  "hasDependents",
  "assigneeUid",
  "pipelineStage",
  "monthlyBenefitBefore",
  "monthlyBenefitAfter",
  "vsoIds",
  "eight00ThreadId",
] as const;

export const VSO_FIELDS = [
  "fullName",
  "affiliation",
  "city",
  "state",
  "directPhone",
  "directEmail",
  "preferredContactMethod",
  "partnershipStatus",
  "notes",
] as const;

/** The resource form's fields. Verification stamps and import ids stay
 *  machine-owned. */
export const RESOURCE_FIELDS = [
  "organizationName",
  "parentOrg",
  "website",
  "contactName",
  "contactPhone",
  "contactEmail",
  "description",
  "eligibility",
  "services",
  "helpsWith",
  "buckets",
  "geoScope",
  "geoStates",
  "geoLocalities",
  "minDischarge",
  "requiresVaEnrollment",
  "requiresValidId",
  "eraRestriction",
  "requiresDependents",
  "populationRestriction",
  "crisisCapable",
  "replacesId",
  "eligibilityNotes",
  "accessMethod",
  "accessValue",
  "whatToBring",
  "typicalWait",
  "verificationStatus",
  "fragility",
  "sourceName",
] as const;

export const TRANSACTION_FIELDS = [
  "date",
  "vendor",
  "description",
  "amount",
  "type",
  "categoryId",
  "allocation",
  "donorName",
  "campaign",
  "notes",
  "veteranId",
] as const;

export const ENCOUNTER_FIELDS = [
  "occurredAt",
  "location",
  "summary",
  "nextStep",
  "nextStepDueAt",
] as const;

export type Plan =
  | { ok: true; changes: FieldChanges }
  | { ok: false; error: string };

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map((i) => `${i.path.map((p) => String(p)).join(".") || "input"}: ${i.message}`)
    .join("; ");
}

function unknownKeys(input: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(input).filter((k) => !allowed.includes(k));
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** What a create lists: defaults like [] and null aren't worth a row. */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
}

/** undefined and null both mean "not set"; Firestore can't store undefined. */
function nullify(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * The editable fields of a stored veteran, normalized the way lib/db/veterans
 * reads them, so "before" compares the same on propose and on approve.
 */
export function veteranSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of VETERAN_FIELDS) out[field] = nullify(raw[field]);
  // Booleans predate the tri-state answer; read them forward.
  if (typeof raw.hasDependents === "boolean") {
    out.hasDependents = raw.hasDependents ? "yes" : "no";
  }
  out.preferredContact ??= "phone";
  out.hardToReach ??= false;
  out.pipelineStage ??= "found";
  out.monthlyBenefitBefore ??= 0;
  out.monthlyBenefitAfter ??= 0;
  out.vsoIds ??= [];
  return out;
}

export function vsoSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of VSO_FIELDS) out[field] = nullify(raw[field]);
  out.partnershipStatus ??= "in_discussion";
  return out;
}

/** Schema input from a snapshot: optional strings and numbers want undefined,
 *  not null. The four eligibility keys and zip accept null (it clears them). */
const NULLABLE_VETERAN_FIELDS = new Set([
  "dischargeCharacter",
  "serviceEra",
  "idStatus",
  "hasDependents",
  "zip",
  "assigneeUid",
  "eight00ThreadId",
]);

function toVeteranInput(merged: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    out[k] = v === null && !NULLABLE_VETERAN_FIELDS.has(k) ? undefined : v;
  }
  return out;
}

function toVsoInput(merged: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) out[k] = v === null ? undefined : v;
  return out;
}

function changesFrom(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChanges {
  const diff = computeDiff(before, after, fields);
  const out: FieldChanges = {};
  for (const [k, v] of Object.entries(diff)) {
    out[k] = { before: nullify(v.before), after: nullify(v.after) };
  }
  return out;
}

/**
 * A veteran edit: the stored record with `patch` laid over it, validated as a
 * whole (so switching preferredContact to email without an email still fails)
 * and diffed only on the fields the patch names.
 */
export function planVeteranUpdate(
  raw: Record<string, unknown>,
  patchRaw: unknown,
): Plan {
  const patch = asObject(patchRaw);
  if (!patch || Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to change." };
  }
  const extra = unknownKeys(patch, VETERAN_FIELDS);
  if (extra.length > 0) {
    return { ok: false, error: `Not editable: ${extra.join(", ")}. Editable: ${VETERAN_FIELDS.join(", ")}.` };
  }

  const before = veteranSnapshot(raw);
  const parsed = veteranInputSchema.safeParse(toVeteranInput({ ...before, ...patch }));
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  const after = tidyVeteran(parsed.data as Record<string, unknown>);

  const changes = changesFrom(before, after, Object.keys(patch));
  if (Object.keys(changes).length === 0) {
    return { ok: false, error: "That's already what the record says." };
  }
  return { ok: true, changes };
}

export function planVeteranCreate(inputRaw: unknown): Plan {
  const input = asObject(inputRaw);
  if (!input) return { ok: false, error: "Expected an object of fields." };
  const extra = unknownKeys(input, VETERAN_FIELDS);
  if (extra.length > 0) {
    return { ok: false, error: `Unknown fields: ${extra.join(", ")}. Allowed: ${VETERAN_FIELDS.join(", ")}.` };
  }
  const parsed = veteranInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  const after = tidyVeteran(parsed.data as Record<string, unknown>);
  const fields = VETERAN_FIELDS.filter((f) => isSet(after[f]));
  return { ok: true, changes: changesFrom({}, after, fields) };
}

export function planVsoUpdate(raw: Record<string, unknown>, patchRaw: unknown): Plan {
  const patch = asObject(patchRaw);
  if (!patch || Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to change." };
  }
  const extra = unknownKeys(patch, VSO_FIELDS);
  if (extra.length > 0) {
    return { ok: false, error: `Not editable: ${extra.join(", ")}. Editable: ${VSO_FIELDS.join(", ")}.` };
  }
  const before = vsoSnapshot(raw);
  const parsed = vsoInputSchema.safeParse(toVsoInput({ ...before, ...patch }));
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  const after = { ...parsed.data, directEmail: parsed.data.directEmail || undefined };

  const changes = changesFrom(before, after, Object.keys(patch));
  if (Object.keys(changes).length === 0) {
    return { ok: false, error: "That's already what the record says." };
  }
  return { ok: true, changes };
}

export function planVsoCreate(inputRaw: unknown): Plan {
  const input = asObject(inputRaw);
  if (!input) return { ok: false, error: "Expected an object of fields." };
  const extra = unknownKeys(input, VSO_FIELDS);
  if (extra.length > 0) {
    return { ok: false, error: `Unknown fields: ${extra.join(", ")}. Allowed: ${VSO_FIELDS.join(", ")}.` };
  }
  const parsed = vsoInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  const after: Record<string, unknown> = {
    ...parsed.data,
    directEmail: parsed.data.directEmail || undefined,
  };
  const fields = VSO_FIELDS.filter((f) => isSet(after[f]));
  return { ok: true, changes: changesFrom({}, after, fields) };
}

/**
 * "2026-10-20" alone parses as UTC midnight, which every US time zone shows as
 * the day before. A bare date means that day, so it's read as noon UTC.
 */
export function noonIfDateOnly(value: unknown): unknown {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
}

function toDate(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(noonIfDateOnly(value) as string | number);
    return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
  }
  return new Date(NaN);
}

/**
 * A plain contact note on a veteran's timeline. Dates go in and come out as
 * ISO strings so the request stays JSON-safe; `now` stands in for a missing
 * occurredAt.
 */
export function planEncounterCreate(inputRaw: unknown, now: Date = new Date()): Plan {
  const input = asObject(inputRaw);
  if (!input) return { ok: false, error: "Expected an object of fields." };
  const extra = unknownKeys(input, ENCOUNTER_FIELDS);
  if (extra.length > 0) {
    return { ok: false, error: `Unknown fields: ${extra.join(", ")}. Allowed: ${ENCOUNTER_FIELDS.join(", ")}.` };
  }
  const parsed = encounterInputSchema.safeParse({
    ...input,
    occurredAt: toDate(input.occurredAt) ?? now,
    nextStepDueAt: toDate(input.nextStepDueAt) ?? null,
  });
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  const e = parsed.data;
  if (Number.isNaN(e.occurredAt.getTime())) return { ok: false, error: "occurredAt: Invalid date" };
  if (e.nextStepDueAt && Number.isNaN(e.nextStepDueAt.getTime())) {
    return { ok: false, error: "nextStepDueAt: Invalid date" };
  }
  if (e.occurredAt.getTime() > now.getTime() + 60 * 60 * 1000) {
    return { ok: false, error: "occurredAt: A contact can't be in the future." };
  }

  const after: Record<string, unknown> = {
    occurredAt: e.occurredAt.toISOString(),
    summary: e.summary.trim(),
    location: e.location?.trim() || undefined,
    nextStep: e.nextStep?.trim() || undefined,
    nextStepDueAt: e.nextStepDueAt ? e.nextStepDueAt.toISOString() : undefined,
  };
  const fields = ENCOUNTER_FIELDS.filter((f) => after[f] !== undefined);
  return { ok: true, changes: changesFrom({}, after, fields) };
}

function pick(raw: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = nullify(raw[field]);
  return out;
}

/** null → undefined, so the schema's defaults and optionals apply. */
function forSchema(merged: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, v === null ? undefined : v]),
  );
}

/**
 * The resource as the form shows it — status included. A stored "live" that's
 * gone 90 days unverified reads as "aging" everywhere, and it has to here too:
 * otherwise editing a phone number would hand editResource a "live" it reads
 * as a fresh verification, silently re-stamping the record.
 */
export function resourceSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const out = pick(raw, RESOURCE_FIELDS);
  const lastVerified = raw.lastVerified as { toDate?: () => Date } | Date | null | undefined;
  out.verificationStatus = derivedVerificationStatus(
    (raw.verificationStatus as VerificationStatus | undefined) ?? "live",
    lastVerified instanceof Date ? lastVerified : (lastVerified?.toDate?.() ?? null),
  );
  return out;
}

export function transactionSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  return pick(raw, TRANSACTION_FIELDS);
}

type Built =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The whole resource input an approval hands to editResource / createResource:
 * the stored record (or nothing, for a create) with the request's after-values
 * laid over it, validated and tidied exactly as the form would be.
 */
export function buildResourceInput(
  raw: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Built {
  const parsed = resourceInputSchema.safeParse(
    forSchema({ ...(raw ? resourceSnapshot(raw) : {}), ...after }),
  );
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  return { ok: true, input: tidyResource(parsed.data as Record<string, unknown>) };
}

export function buildTransactionInput(
  raw: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Built {
  const parsed = transactionInputSchema.safeParse(
    forSchema({ ...(raw ? transactionSnapshot(raw) : {}), ...after }),
  );
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error.issues) };
  return { ok: true, input: parsed.data as Record<string, unknown> };
}

function planEdit(
  label: string,
  fields: readonly string[],
  snapshot: (raw: Record<string, unknown>) => Record<string, unknown>,
  raw: Record<string, unknown>,
  patchRaw: unknown,
  build: (raw: Record<string, unknown>, after: Record<string, unknown>) => Built,
): Plan {
  const patch = asObject(patchRaw);
  if (!patch || Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to change." };
  }
  const extra = unknownKeys(patch, fields);
  if (extra.length > 0) {
    return { ok: false, error: `Not editable on a ${label}: ${extra.join(", ")}. Editable: ${fields.join(", ")}.` };
  }
  const built = build(raw, patch);
  if (!built.ok) return built;
  const changes = changesFrom(snapshot(raw), built.input, Object.keys(patch));
  if (Object.keys(changes).length === 0) {
    return { ok: false, error: "That's already what the record says." };
  }
  return { ok: true, changes };
}

function planNew(
  label: string,
  fields: readonly string[],
  inputRaw: unknown,
  build: (raw: null, after: Record<string, unknown>) => Built,
): Plan {
  const input = asObject(inputRaw);
  if (!input) return { ok: false, error: "Expected an object of fields." };
  const extra = unknownKeys(input, fields);
  if (extra.length > 0) {
    return { ok: false, error: `Unknown ${label} fields: ${extra.join(", ")}. Allowed: ${fields.join(", ")}.` };
  }
  const built = build(null, input);
  if (!built.ok) return built;
  return { ok: true, changes: changesFrom({}, built.input, fields.filter((f) => isSet(built.input[f]))) };
}

export const planResourceUpdate = (raw: Record<string, unknown>, patch: unknown) =>
  planEdit("resource", RESOURCE_FIELDS, resourceSnapshot, raw, patch, buildResourceInput);
export const planResourceCreate = (input: unknown) =>
  planNew("resource", RESOURCE_FIELDS, input, buildResourceInput);
export const planTransactionUpdate = (raw: Record<string, unknown>, patch: unknown) =>
  planEdit("transaction", TRANSACTION_FIELDS, transactionSnapshot, raw, patch, buildTransactionInput);
export const planTransactionCreate = (input: unknown) =>
  planNew("transaction", TRANSACTION_FIELDS, input, buildTransactionInput);

/** Missing, null and [] all mean "not set" — the readers default them. */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? null : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Fields whose stored value no longer matches the request's "before". */
export function driftedFields(
  snapshot: Record<string, unknown>,
  changes: FieldChanges,
): string[] {
  return Object.entries(changes)
    .filter(([field, c]) => !sameValue(snapshot[field], c.before))
    .map(([field]) => field);
}

/** "Maria G." */
export function veteranLabel(v: { firstName?: unknown; lastInitial?: unknown }): string {
  const first = typeof v.firstName === "string" ? v.firstName : "";
  const initial = typeof v.lastInitial === "string" && v.lastInitial ? ` ${v.lastInitial}.` : "";
  return `${first}${initial}`.trim() || "(no name)";
}

/** "Jane Smith (DAV)" */
export function vsoLabel(v: { fullName?: unknown; affiliation?: unknown }): string {
  const name = typeof v.fullName === "string" ? v.fullName : "(no name)";
  return typeof v.affiliation === "string" && v.affiliation ? `${name} (${v.affiliation})` : name;
}
