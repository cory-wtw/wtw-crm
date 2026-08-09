/**
 * Name helpers for the minimized veteran record. We deliberately store only a
 * first name and a single last-initial (data minimization), so these convert
 * between a full name string and that reduced form.
 */

/**
 * Split a full name into a first name and a single upper-case last initial.
 *
 * The parse is intentionally simple and therefore lossy — it takes the first
 * whitespace-delimited token as the first name and the first letter of the
 * last token as the initial. Multi-word first or last names ("Mary Jo",
 * "Van Halen") collapse to that heuristic; there is no way to recover the
 * original once the full last name is discarded, which is the point.
 */
export function splitFullName(full: string): {
  firstName: string;
  lastInitial: string;
} {
  const trimmed = (full ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastInitial: "" };
  const parts = trimmed.split(" ");
  const firstName = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const lastInitial = last ? last[0].toUpperCase() : "";
  return { firstName, lastInitial };
}

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
