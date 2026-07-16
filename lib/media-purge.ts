/**
 * Retention math for the social media wall. Pure functions, no I/O, so the
 * rule ("purge 30 days after a file is marked used") is unit-testable and
 * shared by the UI (to show the countdown) and the cron endpoint (to do the
 * deleting). See app/api/cron/purge-media.
 */

import type { MediaStatus } from "./schemas";

export const MEDIA_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type Purgeable = {
  status: MediaStatus;
  usedAt: Date | null;
};

/**
 * When a "used" item becomes eligible for deletion. Returns null for items
 * that aren't used (and therefore have no purge clock running).
 */
export function purgeDueAt(
  media: Purgeable,
  retentionDays: number = MEDIA_RETENTION_DAYS,
): Date | null {
  if (media.status !== "used" || !media.usedAt) return null;
  return new Date(media.usedAt.getTime() + retentionDays * DAY_MS);
}

/**
 * True when a used item has sat past its retention window and should be
 * deleted (both the Storage file and the Firestore doc).
 */
export function isEligibleForPurge(
  media: Purgeable,
  now: Date,
  retentionDays: number = MEDIA_RETENTION_DAYS,
): boolean {
  const due = purgeDueAt(media, retentionDays);
  if (!due) return false;
  return now.getTime() >= due.getTime();
}

/**
 * Whole days remaining until purge (rounded up, floored at 0). Null when the
 * item isn't on the purge clock. Used for the "deletes in N days" UI hint.
 */
export function daysUntilPurge(
  media: Purgeable,
  now: Date,
  retentionDays: number = MEDIA_RETENTION_DAYS,
): number | null {
  const due = purgeDueAt(media, retentionDays);
  if (!due) return null;
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}
