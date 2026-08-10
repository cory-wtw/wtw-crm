import { type DependentStatus } from "@/lib/schemas";

/**
 * VA disability ratings, in the 10-point steps the VA uses. 0 means no
 * compensable rating (and $0/mo).
 */
export const VA_RATINGS = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;
export type VaRating = (typeof VA_RATINGS)[number];

/** Rate-table doc-id suffix per dependency category (e.g. "70-S"). */
const DEP_SUFFIX: Record<DependentStatus, string> = {
  alone: "A",
  with_spouse: "S",
  with_spouse_kids: "SK",
};

/**
 * The rate-table document id for a rating % + dependency category, or null
 * when the rating is 0 (no compensation, so no row to look up).
 */
export function rateCodeFor(
  rating: number,
  dep: DependentStatus,
): string | null {
  if (!rating || rating <= 0) return null;
  return `${rating}-${DEP_SUFFIX[dep]}`;
}

/**
 * Monthly dollars for a rating % + dependency, resolved against a
 * rateCode -> monthlyAmount map (the current rate year). A 0 rating or a
 * code missing from the map both yield 0.
 */
export function monthlyForRating(
  rating: number,
  dep: DependentStatus,
  amounts: Map<string, number>,
): number {
  const code = rateCodeFor(rating, dep);
  if (!code) return 0;
  return amounts.get(code) ?? 0;
}

/** Income unlocked per month: after minus before, never negative. */
export function monthlyLift(before: number, after: number): number {
  return Math.max(0, after - before);
}
