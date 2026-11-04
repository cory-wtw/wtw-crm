/**
 * The Roster never stores medical records: no diagnoses, treatment letters,
 * claim files, or rating decisions. This file is the one place that decides
 * what "looks medical" so the upload and rename forms, the contact-note
 * hint, the server-side checks, and the admin cleanup tool all agree.
 */
export const MEDICAL_TERMS = [
  "psych",
  "ptsd",
  "tbi",
  "mst",
  "treatment",
  "therapy",
  "diagnos",
  "disability summary",
  "medical",
  "medical records",
  "mental health",
  "medication",
  "prescription",
  "C&P",
  "rating decision",
  "VA decision letter",
  "award letter",
  "claim",
  "claims file",
  "c-file",
  "21-526",
  "nexus",
  "DBQ",
] as const;
export type MedicalTerm = (typeof MEDICAL_TERMS)[number];

/** Short terms would false-match inside ordinary words, so they need word boundaries. */
const SHORT_TERM_MAX = 5;

/** Phrases that contain a term but are routine VSO paperwork, not medical. */
const EXEMPT_PHRASES = ["claim authorization", "non medical"];

/** Attachment categories where "claim" is expected in the file name. */
const CLAIM_OK_CATEGORIES: ReadonlySet<string> = new Set([
  "vso_form",
  "referral_packet",
]);

/** Lowercase, `&` → " and ", and runs of separators collapse to one space. */
export function normalizeMedicalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\s_\-.&/]+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: MedicalTerm): RegExp {
  if (term === "C&P") return /\bc\s*(and|&|-)?\s*p\b/;
  const normalized = escapeRegex(normalizeMedicalText(term));
  return term.length <= SHORT_TERM_MAX
    ? new RegExp(`\\b${normalized}\\b`)
    : new RegExp(normalized);
}

const PATTERNS: readonly { term: MedicalTerm; pattern: RegExp }[] =
  MEDICAL_TERMS.map((term) => ({ term, pattern: termPattern(term) }));

/**
 * Pure match. Returns the terms (as listed above) found in the text, in list
 * order, or an empty array. `category` lets routine VSO/referral paperwork
 * mention "claim" without being flagged.
 */
export function findMedicalTerms(
  text: string | null | undefined,
  category?: string | null,
): MedicalTerm[] {
  let haystack = normalizeMedicalText(text ?? "");
  if (!haystack) return [];
  for (const phrase of EXEMPT_PHRASES) {
    haystack = haystack.split(phrase).join(" ");
  }
  const claimOk = !!category && CLAIM_OK_CATEGORIES.has(category);
  return PATTERNS.filter(({ term, pattern }) => {
    if (claimOk && (term === "claim" || term === "claims file")) return false;
    return pattern.test(haystack);
  }).map(({ term }) => term);
}

export function mentionsMedicalTerm(
  text: string | null | undefined,
  category?: string | null,
): boolean {
  return findMedicalTerms(text, category).length > 0;
}

export type AttachmentUploadDecision =
  | { ok: true; matchedTerms: MedicalTerm[]; nonMedicalConfirmed: boolean }
  | { ok: false; matchedTerms: MedicalTerm[]; error: string };

/**
 * The server-side rule for saving or renaming an attachment: a name that
 * looks medical only goes through when the user confirmed it isn't one.
 * `nonMedicalConfirmed` in the ok branch is what to write to
 * `nonMedicalConfirmedBy` (true → the actor's uid, false → null).
 */
export function attachmentUploadDecision({
  names,
  category,
  confirmed,
}: {
  names: readonly (string | null | undefined)[];
  category?: string | null;
  confirmed?: boolean;
}): AttachmentUploadDecision {
  const matchedTerms = findMedicalTerms(
    names.filter(Boolean).join(" "),
    category,
  );
  if (matchedTerms.length === 0) {
    return { ok: true, matchedTerms, nonMedicalConfirmed: false };
  }
  if (confirmed) {
    return { ok: true, matchedTerms, nonMedicalConfirmed: true };
  }
  return {
    ok: false,
    matchedTerms,
    error: `This looks like a medical record (${matchedTerms.join(", ")}). The Roster never stores diagnoses, treatment letters, or claim files.`,
  };
}
