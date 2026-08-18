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
  const ranked = rankResources(v, survivors, now);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}
