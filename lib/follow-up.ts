/**
 * Follow-up rules. Pure functions, no I/O, in the lib/permissions.ts mould.
 *
 * Two weeks after a packet goes out, staff asks how each resource went. That
 * answer is the strongest verification signal the system has — no crawler can
 * tell you a phone number is dead, and a veteran who tried can.
 */

import type { FollowUpOutcome, Verification } from "@/lib/schemas";

/** Two unreachable reports inside this window flag the resource. */
export const UNREACHABLE_WINDOW_DAYS = 60;
export const UNREACHABLE_REPORTS_TO_FLAG = 2;

/**
 * What a veteran's experience says about the resource record.
 *
 * `ineligible` is a flag, not a pass: the veteran cleared our gates and was
 * turned away anyway, which means a gate value on that record is wrong. It is
 * the cheapest possible signal that the directory is lying, and it only ever
 * arrives this way.
 *
 * `declined` is a pass. The veteran chose not to go; that says nothing about
 * the organization and flagging it would punish a good record for a personal
 * decision.
 */
export function resultForOutcome(
  outcome: FollowUpOutcome,
): "pass" | "flag" | "fail" {
  switch (outcome) {
    case "helped":
    case "reached":
    case "declined":
      return "pass";
    case "unreachable":
    case "ineligible":
      return "flag";
  }
}

/** Prior unreachable reports for a resource inside the window. */
export function recentUnreachableCount(
  priorVerifications: Verification[],
  now: Date,
  windowDays: number = UNREACHABLE_WINDOW_DAYS,
): number {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return priorVerifications.filter(
    (v) =>
      v.checkType === "humanOutcome" &&
      v.outcome === "unreachable" &&
      v.checkedAt.getTime() >= cutoff,
  ).length;
}

/**
 * Whether this unreachable report is the one that flags the resource.
 *
 * Counts the report being recorded now alongside the prior ones, so the second
 * within the window trips it. One veteran who couldn't get through might have
 * called at lunchtime; two inside two months is a dead number.
 *
 * Only ever returns true for `unreachable`. `ineligible` flags the individual
 * check but never the record on its own — a wrong gate value is fixed by
 * editing the record, and auto-flagging on one turned-away veteran would pull
 * good resources out of matching on a single data-entry mistake.
 */
export function shouldFlagForUnreachable(input: {
  outcome: FollowUpOutcome;
  priorVerifications: Verification[];
  now: Date;
}): boolean {
  if (input.outcome !== "unreachable") return false;
  const priors = recentUnreachableCount(input.priorVerifications, input.now);
  return priors + 1 >= UNREACHABLE_REPORTS_TO_FLAG;
}
