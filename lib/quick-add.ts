/**
 * Quick add: a pasted link or block of text → a pre-filled Add Resource form.
 *
 * Pure functions, no I/O. The fetching and the model call live in
 * lib/quick-add-runner.ts; this is the part that has to be right whatever the
 * model returns.
 *
 * The model answers in the bulk importer's vocabulary (lib/resource-import.ts)
 * so there is one shape for "a resource written down by hand". It is NOT run
 * through parseSeedResource, though: that mapper is all-or-nothing on purpose,
 * because a file a person typed should fail loudly. A draft should degrade one
 * field at a time — an invented bucket is dropped and named, and the rest of
 * the form still fills in for a person to finish.
 */

import { format } from "date-fns";
import { linkPath, normalizeUrl, scoreLink, type PageLink } from "@/lib/enrich";
import {
  ACCESS_METHOD_LABELS,
  ACCESS_METHODS,
  BUCKET_CODES,
  BUCKET_LABELS,
  FRAGILITIES,
  FRAGILITY_LABELS,
  GEO_SCOPE_LABELS,
  GEO_SCOPES,
  MIN_DISCHARGE_LABELS,
  MIN_DISCHARGES,
  POPULATION_LABELS,
  POPULATIONS,
  SERVICE_ERA_LABELS,
  SERVICE_ERAS,
  TYPICAL_WAIT_LABELS,
  TYPICAL_WAITS,
  type AccessMethod,
  type Bucket,
  type Fragility,
  type GeoScope,
  type MinDischarge,
  type Population,
  type ServiceEra,
  type TypicalWait,
} from "@/lib/schemas";

/** Linked pages read beyond the one pasted. */
export const FOLLOW_LINK_LIMIT = 2;
/** Cap on pasted text. A flyer or an email is far under this. */
export const MAX_PASTE_CHARS = 30_000;

// --- Input -----------------------------------------------------------------

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
/** A bare "example.org/path" pasted on its own, without the scheme. */
const BARE_DOMAIN = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i;

/**
 * Split what was pasted into the link to read and the text to read directly.
 *
 * The first URL found is the page to fetch. The text keeps everything,
 * URLs included — a flyer that says "see example.org/apply" is still saying
 * it — unless the paste was nothing but the link.
 */
export function splitPaste(raw: string): { url: string | null; text: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: null, text: "" };

  if (!/\s/.test(trimmed) && BARE_DOMAIN.test(trimmed)) {
    return { url: normalizeUrl(`https://${trimmed}`), text: "" };
  }

  const found = trimmed.match(URL_PATTERN) ?? [];
  // Trailing sentence punctuation is almost never part of the link.
  const first = found[0]?.replace(/[.,;:!?]+$/, "");
  const url = first ? normalizeUrl(first) : null;

  const onlyLinks = trimmed.replace(URL_PATTERN, "").trim() === "";
  return { url, text: onlyLinks ? "" : trimmed };
}

const FOLLOW_PATTERN =
  /contact|reach us|phone|services|programs?|what we (do|offer)|eligib|qualif|who (we serve|is eligible)|requirements|get help|how to (get|apply)|\bapply\b/i;

/**
 * Up to two linked pages worth reading: contact, services, or eligibility.
 * Same-site only — extractLinks already enforces that.
 */
export function pickFollowLinks(
  links: PageLink[],
  limit = FOLLOW_LINK_LIMIT,
): string[] {
  return links
    .filter((link) => FOLLOW_PATTERN.test(`${link.text} ${linkPath(link.url)}`))
    .map((link) => ({ url: link.url, score: scoreLink(link) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit)
    .map((link) => link.url);
}

/** "volunteerbehavioralhealth.org, drafted Oct 26 2026" */
export function draftSourceLabel(
  urls: string[],
  hadText: boolean,
  today: Date,
): string {
  const hosts = [
    ...new Set(
      urls.map((url) => {
        try {
          return new URL(url).hostname.replace(/^www\./i, "");
        } catch {
          return url;
        }
      }),
    ),
  ];
  const parts = [...hosts, ...(hadText ? ["pasted text"] : [])];
  return `${parts.join(" + ")}, drafted ${format(today, "MMM d yyyy")}`;
}

// --- Draft → form values ----------------------------------------------------

/** The form's own field names. Kept here so lib/ needn't import from app/. */
export type DraftValues = {
  organizationName?: string;
  parentOrg?: string;
  website?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  description?: string;
  eligibility?: string;
  eligibilityNotes?: string;
  services?: string;
  helpsWith?: string;
  buckets?: Bucket[];
  geoScope?: GeoScope;
  geoStates?: string;
  geoLocalities?: string;
  minDischarge?: MinDischarge;
  requiresVaEnrollment?: boolean;
  requiresValidId?: boolean;
  eraRestriction?: ServiceEra[];
  requiresDependents?: boolean;
  populationRestriction?: Population[];
  crisisCapable?: boolean;
  accessMethod?: AccessMethod;
  accessValue?: string;
  whatToBring?: string;
  typicalWait?: TypicalWait;
  verificationStatus?: "flagged";
  fragility?: Fragility;
  sourceName?: string;
};

/**
 * Highlight keys. One per field on the form — the four requirement checkboxes
 * share one field there, so they share one key here.
 */
export type DraftKey =
  | Exclude<
      keyof DraftValues,
      | "requiresVaEnrollment"
      | "requiresValidId"
      | "requiresDependents"
      | "crisisCapable"
      | "verificationStatus"
    >
  | "requirements";

/** Form field name → the highlight it clears. */
export function draftKeyFor(fieldName: string): DraftKey | null {
  const base = fieldName.split(".")[0];
  if (
    base === "requiresVaEnrollment" ||
    base === "requiresValidId" ||
    base === "requiresDependents" ||
    base === "crisisCapable"
  ) {
    return "requirements";
  }
  if (base === "verificationStatus") return null;
  return base as DraftKey;
}

export type Draft = {
  values: DraftValues;
  /** Fields the source actually answered — what the reviewer must check. */
  filled: DraftKey[];
  /** Values the model gave that the form can't hold, said out loud. */
  notes: string[];
};

/** "Days (usually)" → "days" */
function clean(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

/** A code or its label → the code. */
function lookup<T extends string>(
  codes: readonly T[],
  labels: Record<T, string>,
  value: string,
  aliases: Record<string, T> = {},
): T | null {
  // Compare whole and with any trailing note stripped, on both sides: the
  // label "Pre-9/11 (other)" has a parenthetical of its own.
  const wanted = [value.trim().toLowerCase(), clean(value)];
  for (const code of codes) {
    const label = labels[code].toLowerCase();
    if (wanted.some((w) => w === code || w === label || w === clean(label))) {
      return code;
    }
  }
  return aliases[wanted[0]] ?? aliases[wanted[1]] ?? null;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter((item): item is string => !!item);
  }
  const text = asText(value);
  return text
    ? text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

const ACCESS_ALIASES: Record<string, AccessMethod> = {
  phone: "phone",
  "call": "phone",
  online: "web",
  "register online": "web",
  "walk-in": "walkin",
  "walk in": "walkin",
  referral: "referral",
};

const WAIT_ALIASES: Record<string, TypicalWait> = {
  "same-day": "sameday",
  immediate: "sameday",
};

const SCOPE_ALIASES: Record<string, GeoScope> = {
  statewide: "state",
  local: "local",
  regional: "local",
};

/** Requirement checkbox labels, as the importer spells them. */
const REQ_LABELS: Record<string, "requiresVaEnrollment" | "requiresValidId" | "requiresDependents" | "crisisCapable"> = {
  "requires va enrollment": "requiresVaEnrollment",
  "requires a valid id": "requiresValidId",
  "requires dependents": "requiresDependents",
  "same-day / crisis capable": "crisisCapable",
};

const POPULATION_BY_REQ: Record<string, Population> = {
  "mst survivors only": "mst",
  "homeless veterans only": "homeless",
};

/**
 * The model's answer as form values.
 *
 * Only what it filled comes back in `values`; the form's own defaults cover
 * the rest. That keeps every unanswered gate at its permissive default and
 * every unanswered text field blank, which is the whole point.
 */
export function draftToForm(raw: unknown, sourceName: string): Draft {
  const values: DraftValues = {};
  const filled = new Set<DraftKey>();
  const notes: string[] = [];
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const TEXT: [string, keyof DraftValues & DraftKey][] = [
    ["org_name", "organizationName"],
    ["parent", "parentOrg"],
    ["website", "website"],
    ["contact_name", "contactName"],
    ["phone", "contactPhone"],
    ["email", "contactEmail"],
    ["primary_services", "services"],
    ["what_they_help_with", "helpsWith"],
    ["description", "description"],
    ["eligibility_req", "eligibility"],
    ["elig_notes", "eligibilityNotes"],
    ["phone_to_call", "accessValue"],
    ["what_to_bring", "whatToBring"],
  ];
  for (const [from, to] of TEXT) {
    const text = asText(record[from]);
    if (!text) continue;
    (values as Record<string, unknown>)[to] = text;
    filled.add(to);
  }

  const buckets: Bucket[] = [];
  for (const label of asList(record.buckets)) {
    const code = lookup(BUCKET_CODES, BUCKET_LABELS, label);
    if (!code) notes.push(`Left out bucket "${label}" — not one of the 11.`);
    else if (!buckets.includes(code)) buckets.push(code);
  }
  if (buckets.length > 0) {
    values.buckets = buckets;
    filled.add("buckets");
  }

  const area = asText(record.service_area);
  if (area) {
    const scope =
      lookup(GEO_SCOPES, GEO_SCOPE_LABELS, area, SCOPE_ALIASES) ??
      (clean(area).startsWith("local") ? "local" : null);
    if (!scope) notes.push(`Left out service area "${area}".`);
    else {
      values.geoScope = scope;
      filled.add("geoScope");
    }
  }
  // States only mean something under a statewide or local scope. Without one
  // the form sits at National, where the field is hidden — so a state list
  // with no scope is named rather than filled in where nobody would see it.
  const states = asList(record.states).map((s) => s.toUpperCase());
  if (states.length > 0) {
    if (values.geoScope === "state" || values.geoScope === "local") {
      values.geoStates = states.join(", ");
      filled.add("geoStates");
    } else if (!values.geoScope) {
      notes.push(`Source names states (${states.join(", ")}) but no service area — set the area, then the states.`);
    }
  }
  const localities = asList(record.localities);
  if (localities.length > 0 && values.geoScope === "local") {
    values.geoLocalities = localities.join(", ");
    filled.add("geoLocalities");
  }

  const discharge = asText(record.min_discharge);
  if (discharge) {
    const code = lookup(MIN_DISCHARGES, MIN_DISCHARGE_LABELS, discharge);
    if (!code) notes.push(`Left out minimum discharge "${discharge}".`);
    else {
      values.minDischarge = code;
      filled.add("minDischarge");
    }
  }

  const eras: ServiceEra[] = [];
  for (const label of asList(record.eras)) {
    const code = lookup(SERVICE_ERAS, SERVICE_ERA_LABELS, label);
    if (!code || code === "unsure") {
      notes.push(`Left out era "${label}".`);
    } else if (!eras.includes(code)) eras.push(code);
  }
  if (eras.length > 0) {
    values.eraRestriction = eras;
    filled.add("eraRestriction");
  }

  const populations: Population[] = [];
  for (const label of asList(record.reqs)) {
    const key = label.trim().toLowerCase();
    const req = REQ_LABELS[key];
    const population =
      POPULATION_BY_REQ[key] ?? lookup(POPULATIONS, POPULATION_LABELS, label);
    if (req) {
      values[req] = true;
      filled.add("requirements");
    } else if (population) {
      if (!populations.includes(population)) populations.push(population);
    } else {
      notes.push(`Left out requirement "${label}".`);
    }
  }
  if (populations.length > 0) {
    values.populationRestriction = populations;
    filled.add("populationRestriction");
  }

  const access = asText(record.access_method);
  if (access) {
    const code = lookup(ACCESS_METHODS, ACCESS_METHOD_LABELS, access, ACCESS_ALIASES);
    if (!code) notes.push(`Left out access method "${access}".`);
    else {
      values.accessMethod = code;
      filled.add("accessMethod");
    }
  }

  const wait = asText(record.typical_wait);
  if (wait) {
    const code = lookup(TYPICAL_WAITS, TYPICAL_WAIT_LABELS, wait, WAIT_ALIASES);
    // "Unknown" is the default, not something the source said.
    if (!code) notes.push(`Left out typical wait "${wait}".`);
    else if (code !== "unknown") {
      values.typicalWait = code;
      filled.add("typicalWait");
    }
  }

  const fragility = asText(record.fragility);
  if (fragility) {
    const code = lookup(FRAGILITIES, FRAGILITY_LABELS, fragility);
    if (code) {
      values.fragility = code;
      filled.add("fragility");
    }
  }

  // Never the model's call. A drafted record is held back until Cory has
  // checked it, and the source is what we actually read, not what it says.
  values.verificationStatus = "flagged";
  values.sourceName = sourceName;
  filled.add("sourceName");

  return { values, filled: [...filled], notes };
}

/** The blanks worth chasing before saving. */
export function couldNotFind(values: DraftValues): string[] {
  const missing: string[] = [];
  if (!values.contactPhone && !(values.accessMethod === "phone" && values.accessValue)) {
    missing.push("Phone");
  }
  if (!values.eligibility && !values.eligibilityNotes) missing.push("Eligibility");
  if (!values.geoScope) missing.push("Service area");
  else if (values.geoScope !== "national" && !values.geoStates) {
    missing.push("States served");
  }
  if (values.geoScope === "local" && !values.geoLocalities) {
    missing.push("Counties served");
  }
  if (!values.buckets?.length) missing.push("Buckets");
  return missing;
}

// --- Possible duplicates ----------------------------------------------------

export type DuplicateCandidate = {
  id: string;
  organizationName: string;
  contactPhone?: string | null;
  website?: string | null;
};

export type PossibleDuplicate = {
  id: string;
  organizationName: string;
  reasons: string[];
};

const NAME_NOISE = new Set(["the", "inc", "llc", "co", "corp", "of", "and", "a"]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !NAME_NOISE.has(token));
}

function similarNames(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  if (ja === jb) return true;
  // "Volunteer Behavioral Health" inside "Volunteer Behavioral Health Care
  // System" — but not "VA" inside everything.
  const [shorter, longer] = ja.length <= jb.length ? [ja, jb] : [jb, ja];
  if (shorter.length >= 8 && shorter.split(" ").length >= 2 && ` ${longer} `.includes(` ${shorter} `)) {
    return true;
  }
  const sa = new Set(ta);
  const sb = new Set(tb);
  const shared = [...sa].filter((token) => sb.has(token)).length;
  const union = new Set([...sa, ...sb]).size;
  return sa.size >= 2 && sb.size >= 2 && shared / union >= 0.6;
}

/** Every ten-digit US number in a field, area code first. */
function phoneNumbers(value: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const match of (value ?? "").matchAll(/(?:\+?1[\s.-]*)?\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})/g)) {
    out.add(`${match[1]}${match[2]}${match[3]}`);
  }
  return out;
}

function siteKey(value: string | null | undefined): { host: string; path: string } | null {
  const url = value ? normalizeUrl(value.includes("://") ? value : `https://${value}`) : null;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname.toLowerCase().replace(/^www\./, ""),
      path: parsed.pathname.replace(/\/+$/, "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Same website means the same page, or the same site where either side is
 * just the home page. Two different pages on va.gov are not one organization.
 */
function sameWebsite(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = siteKey(a);
  const kb = siteKey(b);
  if (!ka || !kb || ka.host !== kb.host) return false;
  return ka.path === kb.path || ka.path === "" || kb.path === "";
}

/** Existing records that look like the one being entered. Warns, never blocks. */
export function possibleDuplicates(
  entry: { organizationName?: string; contactPhone?: string; website?: string },
  existing: DuplicateCandidate[],
  limit = 5,
): PossibleDuplicate[] {
  const phones = phoneNumbers(entry.contactPhone);
  const out: PossibleDuplicate[] = [];

  for (const resource of existing) {
    const reasons: string[] = [];
    if (entry.organizationName && similarNames(entry.organizationName, resource.organizationName)) {
      reasons.push("similar name");
    }
    if (phones.size > 0 && [...phoneNumbers(resource.contactPhone)].some((p) => phones.has(p))) {
      reasons.push("same phone");
    }
    if (entry.website && sameWebsite(entry.website, resource.website)) {
      reasons.push("same website");
    }
    if (reasons.length > 0) {
      out.push({ id: resource.id, organizationName: resource.organizationName, reasons });
    }
  }

  return out
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, limit);
}
