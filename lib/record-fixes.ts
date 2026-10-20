/**
 * Record fixes that would otherwise be a list of manual edits. Pure functions,
 * no I/O — lib/record-fixes-apply.ts reads and writes.
 *
 * Each fix is a rule, not a hard-coded id, so it also catches a record added
 * later under the same name. Admin → Record fixes shows exactly what each one
 * would change before anything is written.
 */

import { organizationKey } from "@/lib/matching";
import { neutralizePronouns } from "@/lib/referral-text";
import type { Population, Resource } from "@/lib/schemas";

export type FieldChange = { before: unknown; after: unknown };

export type RecordFix = {
  id: string;
  name: string;
  changes: Record<string, FieldChange>;
  /** Why, in staff terms — one line per rule that touched this record. */
  reasons: string[];
};

/** Only-serves groups a program has by definition. */
const POPULATION_RULES: { match: RegExp; groups: Population[]; why: string }[] = [
  {
    match: /safe helpline|beyond mst/i,
    groups: ["mst"],
    why: "MST-only program — offered only when MST is marked",
  },
  {
    match: /\bssvf\b|supportive services for veteran families/i,
    groups: ["homeless", "housing-risk"],
    why: "SSVF takes only homeless or at-risk veterans",
  },
  {
    match: /hud-?vash/i,
    groups: ["homeless"],
    why: "HUD-VASH takes only homeless veterans",
  },
];

/** Listings that aren't free help and shouldn't be offered. */
const RETIRE_RULES: { match: RegExp; why: string }[] = [
  { match: /\bsailors\b.*home loan|home loan.*\bsailors\b/i, why: "Mortgage lender, not a free service" },
];

/** Free-text fields a veteran may read. */
const TEXT_FIELDS = [
  "description",
  "services",
  "helpsWith",
  "eligibility",
  "eligibilityNotes",
  "whatToBring",
  "accessValue",
] as const;

/** Best copy of a duplicated organization: matchable, most recently verified,
 *  most filled in. */
function keepScore(r: Resource): number {
  const matchable = r.verificationStatus === "live" || r.verificationStatus === "aging" ? 1e15 : 0;
  const verified = r.lastVerified?.getTime() ?? 0;
  const filled = [r.description, r.services, r.accessValue, r.whatToBring, r.website].filter(Boolean)
    .length;
  return matchable + verified / 1e3 + filled;
}

export function planRecordFixes(resources: Resource[]): RecordFix[] {
  const fixes = new Map<string, RecordFix>();
  const fix = (r: Resource, field: string, before: unknown, after: unknown, why: string) => {
    const entry = fixes.get(r.id) ?? { id: r.id, name: r.organizationName, changes: {}, reasons: [] };
    entry.changes[field] = { before: entry.changes[field]?.before ?? before, after };
    if (!entry.reasons.includes(why)) entry.reasons.push(why);
    fixes.set(r.id, entry);
  };

  for (const r of resources) {
    if (r.verificationStatus === "retired") continue;

    for (const rule of POPULATION_RULES) {
      if (!rule.match.test(r.organizationName)) continue;
      const current = r.populationRestriction ?? [];
      const merged = [...new Set([...current, ...rule.groups])];
      if (merged.length !== current.length) {
        fix(r, "populationRestriction", current, merged, rule.why);
      }
    }

    for (const rule of RETIRE_RULES) {
      if (rule.match.test(r.organizationName)) {
        fix(r, "verificationStatus", r.verificationStatus, "retired", rule.why);
        fix(r, "flagReason", r.flagReason ?? null, rule.why, rule.why);
      }
    }

    for (const field of TEXT_FIELDS) {
      const value = r[field];
      if (typeof value !== "string" || !value) continue;
      const neutral = neutralizePronouns(value);
      if (neutral !== value) fix(r, field, value, neutral, "Gender-neutral wording");
    }
  }

  // Duplicates: the same organization name (ignoring case, punctuation, "The",
  // "Inc."). Not a shared website — two clinics of one organization can link
  // the same site and are still two places. Keep the best copy, retire the rest.
  const byName = new Map<string, Resource[]>();
  for (const r of resources) {
    if (r.verificationStatus === "retired") continue;
    const k = organizationKey(r.organizationName);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const [keep, ...rest] = [...group].sort((a, b) => keepScore(b) - keepScore(a));
    for (const r of rest) {
      const why = `Duplicate of another "${keep.organizationName}" record — keeping the better one`;
      fix(r, "verificationStatus", r.verificationStatus, "retired", why);
      fix(r, "flagReason", r.flagReason ?? null, why, why);
    }
  }

  return [...fixes.values()].sort((a, b) => a.name.localeCompare(b.name));
}
