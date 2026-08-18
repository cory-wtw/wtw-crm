import { z } from "zod";
import { followUpOutcomeSchema } from "./encounter";
import type { VerificationStatus } from "./resource";

/**
 * Append-only log of resource verification checks. One doc per check, whether
 * the check was a machine fetch, an AI review, a human decision, or a veteran
 * telling us the number was dead.
 *
 * Top-level rather than a `resources/{id}` subcollection because the admin
 * review queue reads across every resource at once, and a collection-group
 * query for that is more machinery than a flat collection with a `resourceId`.
 *
 * The invariant this collection exists to hold: a resource never sits in
 * `flagged` without a doc here saying who flagged it and why. Nothing derives
 * `flagged` from a clock — only a human action or a Phase 7 check sets it, and
 * both write here in the same batch as the status change.
 */

export const VERIFICATION_CHECK_TYPES = [
  "url",
  "contentDiff",
  "keyword",
  "aiReview",
  "grantList",
  "irsStatus",
  "humanOutcome",
  "manual",
] as const;
export const verificationCheckTypeSchema = z.enum(VERIFICATION_CHECK_TYPES);
export type VerificationCheckType = z.infer<
  typeof verificationCheckTypeSchema
>;

export const VERIFICATION_CHECK_TYPE_LABELS: Record<
  VerificationCheckType,
  string
> = {
  url: "URL health",
  contentDiff: "Content changed",
  keyword: "Keyword scan",
  aiReview: "AI review",
  grantList: "Grant list",
  irsStatus: "IRS status",
  humanOutcome: "Veteran outcome",
  manual: "Human decision",
};

export const VERIFICATION_RESULTS = ["pass", "flag", "fail"] as const;
export const verificationResultSchema = z.enum(VERIFICATION_RESULTS);
export type VerificationResult = z.infer<typeof verificationResultSchema>;

export const VERIFICATION_RESULT_LABELS: Record<VerificationResult, string> = {
  pass: "Passed",
  flag: "Flagged",
  fail: "Failed",
};

export const verificationSchema = z.object({
  id: z.string(),
  resourceId: z.string().min(1),
  checkType: verificationCheckTypeSchema,
  result: verificationResultSchema,
  /** What the check saw, in a sentence a human can read in the queue. */
  detail: z.string(),
  checkedAt: z.date(),
  /** uid of the person, or "system" for an automated check. */
  checkedBy: z.string(),
  /**
   * For humanOutcome checks: what the veteran reported. Stored as its own
   * field rather than left inside `detail`, because the "two unreachables in
   * 60 days" rule counts these and must not do it by parsing prose.
   */
  outcome: followUpOutcomeSchema.optional(),
});
export type Verification = z.infer<typeof verificationSchema>;

export const verificationInputSchema = verificationSchema.omit({
  id: true,
  checkedAt: true,
  checkedBy: true,
});
export type VerificationInput = z.infer<typeof verificationInputSchema>;

/**
 * The check result a human-set verification status represents.
 *
 * Returns null for `aging`, which nobody decides — it's derived from the clock
 * at read time, so there is no check to log.
 */
export function resultForStatus(
  status: VerificationStatus,
): VerificationResult | null {
  switch (status) {
    case "live":
      return "pass";
    case "flagged":
      return "flag";
    case "retired":
      return "fail";
    case "aging":
      return null;
  }
}
