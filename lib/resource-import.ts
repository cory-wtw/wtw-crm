/**
 * Hand-curated JSON → resource input. Pure functions, no I/O.
 *
 * The roster is being built by hand, one organization at a time, and the notes
 * arrive written in the form's own words — "Mental Health & Recovery", "Call",
 * "Any discharge, including other-than-honorable". This maps that vocabulary
 * onto the codes the matcher works in, so the person curating never has to
 * learn the internal ones.
 *
 * Two rules hold throughout:
 *
 * 1. An unrecognized value is an error, never a default. A misspelled bucket
 *    silently becoming `[]` would produce a record that matches nobody and
 *    looks fine on screen — the exact failure the directory already has
 *    hundreds of. Loud beats tidy.
 * 2. Free text is copied, never interpreted. Wait times and service areas are
 *    the only places judgment is applied, and both are matched against a small
 *    explicit table rather than parsed.
 */

import {
  BUCKET_CODES,
  BUCKET_LABELS,
  MIN_DISCHARGES,
  MIN_DISCHARGE_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  type Bucket,
  type MinDischarge,
  type ResourceInput,
  type TypicalWait,
  type VerificationStatus,
} from "@/lib/schemas";

/** The shape the curation notes arrive in. Every field optional — a missing
 *  one is reported by name rather than crashing on undefined. */
export type SeedResource = {
  org_name?: string;
  parent?: string;
  website?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  primary_services?: string;
  description?: string;
  eligibility_req?: string;
  buckets?: string[];
  service_area?: string;
  states?: string;
  localities?: string;
  elig_notes?: string;
  min_discharge?: string;
  eras?: string[];
  reqs?: string[];
  access_method?: string;
  phone_to_call?: string;
  what_to_bring?: string;
  typical_wait?: string;
  status?: string;
  fragility?: string;
  source?: string;
};

/** Label → code, built from the schema so the two can't drift apart. */
function invert<T extends string>(
  codes: readonly T[],
  labels: Record<T, string>,
): Map<string, T> {
  return new Map(codes.map((code) => [labels[code].toLowerCase(), code]));
}

const BUCKETS_BY_LABEL = invert(BUCKET_CODES, BUCKET_LABELS);
const DISCHARGE_BY_LABEL = invert(MIN_DISCHARGES, MIN_DISCHARGE_LABELS);
const STATUS_BY_LABEL = invert(
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
);

/**
 * Access methods, by the label the form shows plus the phrasings that keep
 * turning up in curation notes. "App download" is `web` because there is no
 * app-store access method and inventing one would be a schema change for a
 * single record — the link in `accessValue` carries the real instruction.
 */
const ACCESS_BY_LABEL: Record<string, ResourceInput["accessMethod"]> = {
  call: "phone",
  phone: "phone",
  "apply online": "web",
  "register online": "web",
  online: "web",
  web: "web",
  "app download": "web",
  "app download (free)": "web",
  "walk in": "walkin",
  walkin: "walkin",
  "referral required": "referral",
  referral: "referral",
};

/**
 * Wait times. Anything not on this list is an error rather than `unknown`,
 * because `unknown` is a real answer meaning "nobody has established this" and
 * a typo must not be able to impersonate it.
 *
 * Ranges round DOWN in optimism — "weeks to months" is `months`. Ranking
 * rewards a short wait, so guessing short moves a resource up the list on a
 * promise the organization never made, and the veteran pays for that.
 */
const WAIT_BY_LABEL: Record<string, TypicalWait> = {
  "same day": "sameday",
  sameday: "sameday",
  immediate: "sameday",
  none: "sameday",
  days: "days",
  weeks: "weeks",
  months: "months",
  "weeks to months": "months",
  "months to years": "months",
  // A cohort program: you wait for the next intake, not for a queue to clear.
  // Weeks rather than months because the cohorts are seasonal and short, and
  // this is the judgment call most worth a second opinion on the record.
  "next session start": "weeks",
  "next cohort": "weeks",
  unknown: "unknown",
};

/** Trailing parentheticals are commentary, not values: "Days (usually)". */
function stripNote(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export type SeedParse =
  | { ok: true; input: ResourceInput; externalId: string; warnings: string[] }
  | { ok: false; errors: string[] };

/** `seed:chattanooga-vet-center` — stable across re-runs so a second load
 *  updates the record rather than adding a twin. */
export function seedExternalId(orgName: string): string {
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `seed:${slug}`;
}

/**
 * Map one curated record.
 *
 * Returns every problem at once rather than the first: a person fixing a JSON
 * file wants the whole list, not five more runs.
 */
export function parseSeedResource(raw: SeedResource): SeedParse {
  const errors: string[] = [];
  const warnings: string[] = [];

  const organizationName = raw.org_name?.trim();
  if (!organizationName) {
    return { ok: false, errors: ["org_name is required"] };
  }

  const buckets: Bucket[] = [];
  for (const label of raw.buckets ?? []) {
    const code = BUCKETS_BY_LABEL.get(label.trim().toLowerCase());
    if (!code) {
      errors.push(`unknown bucket "${label}"`);
      continue;
    }
    if (!buckets.includes(code)) buckets.push(code);
  }
  if (buckets.length === 0 && errors.length === 0) {
    // Not fatal, but it matches nobody until somebody classifies it, and
    // silence about that is how the directory filled up with dead records.
    warnings.push("no buckets — this record will match nobody until it has one");
  }

  // Service area. `local` must name its localities or the schema rejects it,
  // and the curation notes carry the place inside a phrase like
  // "Local (Chattanooga area)" — so read it from there rather than guessing.
  const area = (raw.service_area ?? "").trim().toLowerCase();
  let geoScope: ResourceInput["geoScope"] = "national";
  let geoLocalities = splitList(raw.localities);
  if (area.startsWith("local")) {
    geoScope = "local";
    if (geoLocalities.length === 0) {
      const inParens = /\(([^)]*)\)/.exec(raw.service_area ?? "")?.[1];
      const place = inParens?.replace(/\s+area$/i, "").trim();
      if (place) {
        geoLocalities = [place];
        warnings.push(`localities read from service_area as "${place}"`);
      }
    }
  } else if (area.startsWith("state")) {
    geoScope = "state";
  } else if (area && !area.startsWith("national")) {
    errors.push(`unknown service_area "${raw.service_area}"`);
  }

  const geoStates =
    geoScope === "national"
      ? []
      : splitList(raw.states).map((s) => s.toUpperCase());
  if (geoScope !== "national" && geoStates.length === 0) {
    errors.push(`service_area "${raw.service_area}" needs at least one state`);
  }
  if (geoScope === "local" && geoLocalities.length === 0) {
    errors.push(
      `service_area "${raw.service_area}" needs a city or county — add "localities"`,
    );
  }

  let minDischarge: MinDischarge = "any";
  if (raw.min_discharge) {
    const code = DISCHARGE_BY_LABEL.get(raw.min_discharge.trim().toLowerCase());
    if (!code) errors.push(`unknown min_discharge "${raw.min_discharge}"`);
    else minDischarge = code;
  }

  let accessMethod: ResourceInput["accessMethod"] = "phone";
  if (raw.access_method) {
    const code =
      ACCESS_BY_LABEL[raw.access_method.trim().toLowerCase()] ??
      ACCESS_BY_LABEL[stripNote(raw.access_method).toLowerCase()];
    if (!code) errors.push(`unknown access_method "${raw.access_method}"`);
    else accessMethod = code;
  }

  // Absent means flagged — silence is not a claim that somebody checked.
  let verificationStatus: VerificationStatus = "flagged";
  if (raw.status) {
    const code = STATUS_BY_LABEL.get(raw.status.trim().toLowerCase());
    if (!code) errors.push(`unknown status "${raw.status}"`);
    else verificationStatus = code;
  }

  let typicalWait: TypicalWait = "unknown";
  if (raw.typical_wait) {
    const cleaned = stripNote(raw.typical_wait).toLowerCase();
    const code = WAIT_BY_LABEL[cleaned];
    if (!code) errors.push(`unknown typical_wait "${raw.typical_wait}"`);
    else {
      typicalWait = code;
      if (cleaned.includes(" to ")) {
        warnings.push(
          `typical_wait "${raw.typical_wait}" read as the slower end (${code})`,
        );
      }
    }
  }

  // Requirements arrive as checkbox labels. Anything absent is false, which is
  // the permissive direction: an unstated gate must not exclude anybody.
  const reqs = new Set((raw.reqs ?? []).map((r) => r.trim().toLowerCase()));
  const KNOWN_REQS = new Map([
    ["requires va enrollment", "requiresVaEnrollment"],
    ["requires dependents", "requiresDependents"],
    ["requires a valid id", "requiresValidId"],
    ["same-day / crisis capable", "crisisCapable"],
  ]);
  for (const req of reqs) {
    if (!KNOWN_REQS.has(req)) errors.push(`unknown requirement "${req}"`);
  }

  if (raw.eras && raw.eras.length > 0) {
    // Era restriction is a gate that excludes, and none of the hand-curated
    // records so far use one. Rather than map it half-tested, say so.
    errors.push(
      "eras aren't mapped yet — leave the list empty, or set the era restriction in the form after loading",
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  const text = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const input: ResourceInput = {
    organizationName,
    parentOrg: text(raw.parent),
    website: text(raw.website),
    contactName: text(raw.contact_name),
    contactPhone: text(raw.phone),
    contactEmail: text(raw.email),
    description: text(raw.description),
    eligibility: text(raw.eligibility_req),
    eligibilityNotes: text(raw.elig_notes),
    services: text(raw.primary_services),

    buckets,
    geoScope,
    geoStates,
    geoLocalities: geoScope === "local" ? geoLocalities : [],

    minDischarge,
    requiresVaEnrollment: reqs.has("requires va enrollment"),
    requiresValidId: reqs.has("requires a valid id"),
    eraRestriction: [],
    requiresDependents: reqs.has("requires dependents"),
    crisisCapable: reqs.has("same-day / crisis capable"),

    accessMethod,
    // The dialling instruction, not the switchboard number: "423-855-6570
    // (local) or 877-927-8387 (24/7)" is what a veteran needs to hear.
    accessValue: text(raw.phone_to_call) ?? text(raw.website),
    whatToBring: text(raw.what_to_bring),
    typicalWait,

    // Honoured from the file rather than forced.
    //
    // "Nothing auto-publishes" is about records a machine wrote — an importer
    // guessing gates from a facility type, or a model reading a web page. A
    // person who researched an organization, cited the source, and wrote
    // "Live" has done the review this rule exists to require, and overriding
    // that would mean opening five records to flip a switch they already set.
    // The human action is still there: it's typing --commit.
    verificationStatus,
    fragility: raw.fragility?.trim().toLowerCase() === "fragile"
      ? "fragile"
      : "stable",
    sourceName: text(raw.source),
  };

  return {
    ok: true,
    input,
    externalId: seedExternalId(organizationName),
    warnings,
  };
}
