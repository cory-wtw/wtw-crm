/**
 * Name helpers for the minimized veteran record. We deliberately store only a
 * first name and a single last-initial (data minimization).
 */

/**
 * Render the reduced name for display, e.g. "John D." — or just the first
 * name when there's no initial on file.
 */
export function formatShortName(
  firstName: string | null | undefined,
  lastInitial: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const initial = (lastInitial ?? "").trim();
  if (!first) return initial ? `${initial.toUpperCase()}.` : "";
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}
