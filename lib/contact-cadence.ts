import type { PipelineStage, Veteran } from "@/lib/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKLY_CONTACT_DAYS = 7;
export const MONTHLY_CONTACT_DAYS = 30;

/**
 * Whether the veteran has filed a claim yet, for check-in cadence purposes.
 * `won` still counts as filed — the claim is in, WTW just keeps checking in
 * less often once it's out of the veteran's hands.
 */
export function hasFiled(stage: PipelineStage): boolean {
  return stage === "filed" || stage === "won";
}

/**
 * Whether this veteran is still owed a standing check-in at all. `lost`
 * means the pipeline closed out — nothing left to chase.
 */
export function needsContactCadence(stage: PipelineStage): boolean {
  return stage !== "lost";
}

/**
 * Once a week until they've filed, once a month after: filing is the long
 * wait, and a monthly call is enough to keep someone from feeling forgotten
 * during it. Before filing, a week of silence is how people fall through.
 */
export function contactCadenceDays(stage: PipelineStage): number {
  return hasFiled(stage) ? MONTHLY_CONTACT_DAYS : WEEKLY_CONTACT_DAYS;
}

/**
 * When this veteran is next owed a check-in. Falls back to `createdAt` for a
 * record with no contact logged yet — adding a veteran counts as day zero.
 */
export function contactDueDate(
  veteran: Pick<Veteran, "pipelineStage" | "lastContactedAt" | "createdAt">,
): Date {
  const since = veteran.lastContactedAt ?? veteran.createdAt;
  return new Date(
    since.getTime() + contactCadenceDays(veteran.pipelineStage) * DAY_MS,
  );
}
