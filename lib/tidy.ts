/**
 * One shape for every phone, email, website, state, ZIP and name we store.
 * Pure functions, no I/O.
 *
 * Applied on every save (forms and JSON import) and once, through Admin → Tidy
 * data, to what was saved before. Conservative on purpose: a value that isn't
 * clearly a phone number or a URL is left exactly as typed, so an instruction
 * like "Dial 211 and ask for housing" never gets mangled.
 */

import { normalizeState } from "@/lib/zip-infer";

/** Whitespace collapsed, ends trimmed. */
export function tidyText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const PHONE_IN_TEXT =
  /(?<![\d-])(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?![\d-])/g;

/**
 * Every US phone number in the text as 423-855-6570, wherever it sits —
 * "(423) 855.6570 (local) or 1 877 927 8387" becomes "423-855-6570 (local) or
 * 877-927-8387". Everything around the numbers is left alone.
 */
export function tidyPhones(value: string): string {
  return tidyText(value).replace(PHONE_IN_TEXT, "$1-$2-$3");
}

export function tidyEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** "WWW.Example.org/Apply/" → "https://www.example.org/Apply". Not a URL →
 *  untouched. */
export function tidyWebsite(value: string): string {
  const text = value.trim();
  const match = /^(https?:\/\/)?([a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?(\/\S*)?$/i.exec(text);
  if (!match) return text;
  const scheme = (match[1] ?? "https://").toLowerCase();
  const path = (match[5] ?? "").replace(/\/+$/, "");
  return `${scheme}${match[2].toLowerCase()}${match[4] ?? ""}${path}`;
}

/** "georgia", "Ga." → "GA". Unknown → uppercase as typed. */
export function tidyState(value: string): string {
  return normalizeState(value) ?? value.trim().toUpperCase();
}

/** "30741-1234" → "30741". Not a ZIP → untouched. */
export function tidyZip(value: string): string {
  const text = value.trim();
  return /^\d{5}(-?\d{4})?$/.test(text) ? text.slice(0, 5) : text;
}

/**
 * Names and cities in title case — but only when typed all-lower or all-upper.
 * "ROSSVILLE" → "Rossville", "fort oglethorpe" → "Fort Oglethorpe"; "LaFayette"
 * and "McCaysville" are already deliberate and stay as they are.
 */
export function tidyName(value: string): string {
  const text = tidyText(value);
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

type Tidiers = Record<string, (value: string) => string>;

/** Apply tidiers to the string fields they name; everything else passes. */
function tidyFields<T extends Record<string, unknown>>(record: T, tidiers: Tidiers): T {
  const out: Record<string, unknown> = { ...record };
  for (const [field, tidy] of Object.entries(tidiers)) {
    const value = out[field];
    if (typeof value === "string" && value) out[field] = tidy(value);
  }
  return out as T;
}

export const RESOURCE_TIDIERS: Tidiers = {
  organizationName: tidyText,
  parentOrg: tidyText,
  website: tidyWebsite,
  contactName: tidyName,
  contactPhone: tidyPhones,
  contactEmail: tidyEmail,
  helpsWith: tidyText,
  accessValue: tidyPhones,
};

export const VETERAN_TIDIERS: Tidiers = {
  firstName: tidyName,
  lastInitial: (v) => v.trim().toUpperCase(),
  phone: tidyPhones,
  email: tidyEmail,
  city: tidyName,
  state: tidyState,
  zip: tidyZip,
};

export function tidyResource<T extends Record<string, unknown>>(record: T): T {
  const out = tidyFields(record, RESOURCE_TIDIERS);
  // Lists of places and states, one shape each.
  const lists = out as Record<string, unknown>;
  if (Array.isArray(lists.geoStates)) {
    lists.geoStates = (lists.geoStates as string[]).map(tidyState);
  }
  if (Array.isArray(lists.geoLocalities)) {
    lists.geoLocalities = (lists.geoLocalities as string[]).map(tidyName);
  }
  return out;
}

export function tidyVeteran<T extends Record<string, unknown>>(record: T): T {
  return tidyFields(record, VETERAN_TIDIERS);
}

/** The fields a tidy would change, before → after. Empty when already tidy. */
export function tidyChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { before: before[key], after: after[key] };
    }
  }
  return changes;
}
