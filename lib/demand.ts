/**
 * What veterans asked for, and what we had nothing for.
 *
 * Pure functions, no I/O, in the lib/permissions.ts mould.
 *
 * The directory gets built from somewhere. Building it from a hunch produces a
 * roster of organizations that look useful; building it from this produces one
 * that answers calls that actually came in. Every number here comes out of
 * intake encounters — boxes staff ticked while a veteran was on the phone — so
 * the ranking is in the veterans' terms and not ours.
 *
 * The number to act on is `unmet`: times a need was raised and the gates could
 * not produce a single organization for it. That is a hole in the roster with
 * a name and a count, and it is the only list here worth working down.
 */

import { BUCKET_CODES, type Bucket } from "@/lib/schemas";

/** One intake run, reduced to what this file needs. */
export type IntakeRun = {
  /** Buckets staff checked on the call. */
  bucketsIdentified: Bucket[];
  /**
   * Buckets that had at least one resource clear the gates. Null on runs
   * written before this was recorded — unknown, not "none".
   */
  bucketsMatched: Bucket[] | null;
  /** How many resources cleared the gates across the whole run. */
  candidatesFound: number | null;
};

export type BucketDemand = {
  bucket: Bucket;
  /** Intakes where this need was raised. */
  asked: number;
  /** Intakes where it was raised and nothing could be offered for it. */
  unmet: number;
  /**
   * Intakes where it was raised and we can't tell either way, because the run
   * predates `bucketsMatched`. Kept visible rather than folded into `unmet`:
   * inflating a gap is how you end up chasing the wrong organizations.
   */
  unknown: number;
};

export type DemandSummary = {
  /** Every bucket that was raised at least once, worst gap first. */
  demand: BucketDemand[];
  /** Intake runs counted. */
  intakes: number;
  /** Runs where the whole call produced nobody. */
  emptyHanded: number;
  /** Runs where no box was checked at all — a call that ended early. */
  nothingChecked: number;
};

/**
 * Whether a checked bucket went unserved on this run.
 *
 * Three states, and the third is why this isn't a boolean. A run that matched
 * nobody at all is a certain gap whatever else we recorded. Otherwise the
 * matched list decides it. And a run from before we recorded that list can't
 * be judged, so it says so instead of guessing.
 */
export function bucketOutcome(
  run: IntakeRun,
  bucket: Bucket,
): "met" | "unmet" | "unknown" {
  if (run.candidatesFound === 0) return "unmet";
  if (run.bucketsMatched === null) return "unknown";
  return run.bucketsMatched.includes(bucket) ? "met" : "unmet";
}

/**
 * Roll intake runs into a ranked list of what the roster is missing.
 *
 * Ordered by unmet first, then by how often it was asked. A need raised eight
 * times with nothing to offer outranks one raised twice, and both outrank
 * anything already being served — the top of this list is where the next
 * afternoon of roster-building pays off most.
 */
export function summarizeDemand(runs: IntakeRun[]): DemandSummary {
  const asked = new Map<Bucket, number>();
  const unmet = new Map<Bucket, number>();
  const unknown = new Map<Bucket, number>();

  const bump = (map: Map<Bucket, number>, bucket: Bucket) =>
    map.set(bucket, (map.get(bucket) ?? 0) + 1);

  let emptyHanded = 0;
  let nothingChecked = 0;

  for (const run of runs) {
    if (run.candidatesFound === 0) emptyHanded++;
    if (run.bucketsIdentified.length === 0) nothingChecked++;

    // A bucket ticked twice on one call is still one call asking for it.
    for (const bucket of new Set(run.bucketsIdentified)) {
      bump(asked, bucket);
      const outcome = bucketOutcome(run, bucket);
      if (outcome === "unmet") bump(unmet, bucket);
      if (outcome === "unknown") bump(unknown, bucket);
    }
  }

  const demand = BUCKET_CODES.filter((bucket) => asked.has(bucket))
    .map((bucket) => ({
      bucket,
      asked: asked.get(bucket) ?? 0,
      unmet: unmet.get(bucket) ?? 0,
      unknown: unknown.get(bucket) ?? 0,
    }))
    .sort((a, b) => b.unmet - a.unmet || b.asked - a.asked);

  return {
    demand,
    intakes: runs.length,
    emptyHanded,
    nothingChecked,
  };
}
