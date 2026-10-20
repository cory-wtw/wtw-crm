/**
 * The concierge matching engine: hard gates, then ranking of what survives.
 *
 * Pure functions with no I/O, in the lib/permissions.ts mould — actions load
 * the resources and pass them in. Nothing here reads Firestore, and nothing
 * here decides anything on a veteran's behalf: it narrows a field so a person
 * can choose well.
 */

export * from "./types";
export * from "./gates";
export * from "./ranking";
export * from "./flags";

import type { Resource } from "@/lib/schemas";
import { passesGates } from "./gates";
import { rankResources, type RankedResource } from "./ranking";
import type { MatchInput } from "./types";

/**
 * Gate the corpus, then rank the survivors.
 *
 * `limit` trims the list a staff member reads, not the list they may choose
 * from — Phase 3 shows the top 8 and lets staff search the full directory to
 * add anything the matcher missed.
 */
export function findCandidates(
  v: MatchInput,
  resources: Resource[],
  { limit, now }: { limit?: number; now?: Date } = {},
): RankedResource[] {
  const survivors = resources.filter((r) => passesGates(v, r).passes);
  const ranked = dedupeByName(rankResources(v, survivors, now));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/** Name as a dedupe key: case, punctuation, spacing, a leading "The" and a
 *  trailing "Inc." don't make a twin. */
export function organizationKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .replace(/ (inc|llc|incorporated)$/, "")
    .trim();
}

/**
 * Every way two records can turn out to be the same organization: the name, or
 * the exact web page. An import and a hand entry rarely spell the name the
 * same, but they link the same site. The whole address, not just the host —
 * every VA facility lives on va.gov.
 */
export function organizationKeys(r: {
  organizationName: string;
  website?: string;
}): string[] {
  const keys = [`name:${organizationKey(r.organizationName)}`];
  const page = r.website
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (page && page.includes(".")) keys.push(`web:${page}`);
  return keys;
}

/** Keeps the first record of each organization; pass items in rank order. */
export function firstOfEachOrganization<T>(
  items: T[],
  resourceOf: (item: T) => Parameters<typeof organizationKeys>[0],
  seen: Set<string> = new Set(),
): T[] {
  return items.filter((item) => {
    const keys = organizationKeys(resourceOf(item));
    if (keys.some((k) => seen.has(k))) return false;
    for (const k of keys) seen.add(k);
    return true;
  });
}

/**
 * One entry per organization, keeping the highest-ranked copy. The same food
 * bank entered twice (an import and a hand entry) would otherwise take two of
 * the eight places on the short list.
 */
function dedupeByName(ranked: RankedResource[]): RankedResource[] {
  return firstOfEachOrganization(ranked, (r) => r.resource);
}
