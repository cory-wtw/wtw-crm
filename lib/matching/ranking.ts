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
import { localityMatch, type LocalityTier } from "./gates";
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
    /** Local resources, nearest first — see localityMatch. */
    city: 140,
    county: 120,
    nearby: 100,
    area: 90,
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
  /**
   * Taken off for each resource already above it on the list covering the
   * same need — a fourth food pantry is worth less than a first answer to
   * housing. Only when every need it covers is already covered.
   */
  repeatNeed: 50,
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
  /** Zero or negative: set by diversify, not scoreResource. */
  repeatNeed: number;
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

/** Out of range scores nothing — never a silent "same county". */
function localGeography(tier: LocalityTier | null): number {
  return tier ? RANKING_WEIGHTS.geography[tier] : 0;
}

/** Score one gate survivor. Higher is better; nothing here is negative. */
export function scoreResource(
  v: MatchInput,
  r: Resource,
  now: Date = new Date(),
  /** The tier the gates already worked out; computed here when omitted. */
  locality?: LocalityTier | null,
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
        : localGeography(locality === undefined ? localityMatch(v, r) : locality);

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
    repeatNeed: 0,
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
  /** Locality tiers from the gates, so they aren't computed twice. */
  localities?: Map<Resource, LocalityTier | null | undefined>,
): RankedResource[] {
  return survivors
    .map((resource) => {
      const breakdown = scoreResource(v, resource, now, localities?.get(resource));
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

/**
 * Re-order a ranked list so it spreads across the veteran's needs.
 *
 * Picks greedily: at each step, every remaining resource whose needs are all
 * already covered above it loses repeatNeed for each time its least-covered
 * need has been covered. Someone who asked about food, housing and work sees
 * one or two pantries, then housing and work — not four pantries first.
 * Resources that answer an uncovered need keep their full score.
 */
export function diversify(ranked: RankedResource[]): RankedResource[] {
  const remaining = [...ranked];
  const covered = new Map<string, number>();
  const out: RankedResource[] = [];

  const penalty = (r: RankedResource) => {
    if (r.matchedBuckets.length === 0) return 0;
    const times = Math.min(...r.matchedBuckets.map((b) => covered.get(b) ?? 0));
    return times === 0 ? 0 : -RANKING_WEIGHTS.repeatNeed * times;
  };

  while (remaining.length > 0) {
    let bestAt = 0;
    let bestScore = -Infinity;
    remaining.forEach((r, i) => {
      const s = r.breakdown.total - r.breakdown.repeatNeed + penalty(r);
      if (s > bestScore) {
        bestScore = s;
        bestAt = i;
      }
    });
    const [pick] = remaining.splice(bestAt, 1);
    const repeatNeed = penalty(pick);
    const total = pick.breakdown.total - pick.breakdown.repeatNeed + repeatNeed;
    out.push({ ...pick, score: total, breakdown: { ...pick.breakdown, repeatNeed, total } });
    for (const b of pick.matchedBuckets) covered.set(b, (covered.get(b) ?? 0) + 1);
  }
  return out;
}
