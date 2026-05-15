import type { AuditDiff } from "./schemas";

/**
 * Shallow value-equality used by computeDiff. Treats two values as
 * equal when their JSON serialization matches (handles arrays and
 * plain objects); falls back to strict equality otherwise.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Build an audit diff for the named fields between two snapshots.
 * Only includes fields whose values changed.
 */
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: ReadonlyArray<string>,
): AuditDiff {
  const diff: AuditDiff = {};
  for (const field of fields) {
    const b = before[field];
    const a = after[field];
    if (!isEqual(b, a)) {
      diff[field] = { before: b ?? null, after: a ?? null };
    }
  }
  return diff;
}
