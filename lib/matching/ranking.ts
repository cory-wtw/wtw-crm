/**
 * Ranking of gate survivors. Pure functions, no I/O.
 *
 * Ranking never decides eligibility — gates.ts already did that. This only
 * orders what's left, so the staff member reads the most useful option first.
 * Every number lives in RANKING_WEIGHTS so the weights can be tuned from real
 * calls without touching the logic.
 */

import {
  AGING_AFTER_DAYS,
  type Resource,
  STALE_AFTER_DAYS,
} from "@/lib/schemas";
import type { MatchInput } from "./types";

/**
 * The whole scoring model, in one object.
 *
 * Crisis dwarfs everything because when someone has nowhere to sleep tonight,
 * nothing else on the list matters yet. Legal unlock outranks what the veteran
 * actually asked for on purpose: no valid ID blocks a housing voucher, a job,
 * and a bank account, so if someone calls about housing with no ID, the ID
 * surfaces first.
 */
export const RANKING_WEIGHTS = {
  crisis: 1000,
  legalUnlock: 200,
  geography: {
    locality: 120,
    state: 80,
    national: 40,
  },
  /** Access friction — how much work it takes to get through the door. */
  access: {
    walkin: 100,
    phone: 60,
    web: 30,
    referral: 10,
  },
  wait: {
    sameday: 80,
    days: 50,
    weeks: 20,
    months: 0,
    /** Unrecorded wait scores like the worst case rather than flattering it. */
    unknown: 0,
  },
  /** Freshness bands, split at AGING_AFTER_DAYS and STALE_AFTER_DAYS. */
  freshness: {
    fresh: 60,
    aging: 30,
    stale: 0,
  },
  bucketCoverage: 25,
} as const;

/** Per-signal contributions, kept so the review screen can explain a score. */
export type ScoreBreakdown = {
  crisis: number;
  legalUnlock: number;
  geography: number;
  access: number;
  wait: number;
  freshness: number;
  bucketCoverage: number;
  total: number;
};

export type RankedResource = {
  resource: Resource;
  score: number;
  breakdown: ScoreBreakdown;
  /** Which of the veteran's needs this resource covers. */
  matchedBuckets: Resource["buckets"];
};

/**
 * Freshness band for a record, from how long ago a human last confirmed it.
 *
 * A record nobody has ever verified scores as stale rather than fresh — an
 * unknown last-verified date is not evidence of freshness. Past
 * STALE_AFTER_DAYS the signal is 0, which sorts the record last without
 * removing it from the list: still shown, still matchable, just behind
 * everything a human has touched more recently.
 */
export function freshnessScore(
  lastVerified: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastVerified) return RANKING_WEIGHTS.freshness.stale;
  const days = (now.getTime() - lastVerified.getTime()) / 86_400_000;
  if (days < AGING_AFTER_DAYS) return RANKING_WEIGHTS.freshness.fresh;
  if (days < STALE_AFTER_DAYS) return RANKING_WEIGHTS.freshness.aging;
  return RANKING_WEIGHTS.freshness.stale;
}

/** The needs this resource covers, in the resource's own bucket order. */
export function matchedBuckets(
  v: MatchInput,
  r: Resource,
): Resource["buckets"] {
  return r.buckets.filter((bucket) => v.needs.includes(bucket));
}

/** Score one gate survivor. Higher is better; nothing here is negative. */
export function scoreResource(
  v: MatchInput,
  r: Resource,
  now: Date = new Date(),
): ScoreBreakdown {
  const crisis =
    v.safeTonight === false && r.crisisCapable ? RANKING_WEIGHTS.crisis : 0;

  const legalUnlock =
    r.buckets.includes("legal") && v.idStatus !== "valid"
      ? RANKING_WEIGHTS.legalUnlock
      : 0;

  const geography =
    r.geoScope === "national"
      ? RANKING_WEIGHTS.geography.national
      : r.geoScope === "state"
        ? RANKING_WEIGHTS.geography.state
        : RANKING_WEIGHTS.geography.locality;

  const access = RANKING_WEIGHTS.access[r.accessMethod];
  const wait = RANKING_WEIGHTS.wait[r.typicalWait];
  const freshness = freshnessScore(r.lastVerified, now);
  const bucketCoverage =
    matchedBuckets(v, r).length * RANKING_WEIGHTS.bucketCoverage;

  return {
    crisis,
    legalUnlock,
    geography,
    access,
    wait,
    freshness,
    bucketCoverage,
    total:
      crisis +
      legalUnlock +
      geography +
      access +
      wait +
      freshness +
      bucketCoverage,
  };
}

/**
 * Score and sort. Highest first; ties break on organization name so the same
 * intake always produces the same list in the same order.
 *
 * Takes gate survivors only — pass the output of filterByGates. Ranking an
 * ineligible resource would put something at the top of the list that will
 * turn the veteran away.
 */
export function rankResources(
  v: MatchInput,
  survivors: Resource[],
  now: Date = new Date(),
): RankedResource[] {
  return survivors
    .map((resource) => {
      const breakdown = scoreResource(v, resource, now);
      return {
        resource,
        score: breakdown.total,
        breakdown,
        matchedBuckets: matchedBuckets(v, resource),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.resource.organizationName.localeCompare(b.resource.organizationName),
    );
}
