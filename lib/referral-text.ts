/**
 * The plain-text block staff copies into an email and sends themselves.
 *
 * Pure functions, no I/O. There is no mail provider in this system and this
 * file does not add one: nothing here sends anything, and nothing calls it
 * except an action a person triggered by approving a packet.
 *
 * Four things must never appear in the output, per §5.1 and §11:
 *
 *   1. dollar figures
 *   2. outcome predictions
 *   3. claim advice
 *   4. any statement about what to file
 *
 * The template itself contains none of them. The risk is the free text staff
 * typed into a resource record — a description reading "up to $1,200 in rent
 * help" or "we'll get you approved" would carry straight through. So any
 * borrowed sentence is screened, and a sentence that trips the screen is
 * replaced wholesale rather than edited: a half-redacted line is worse than a
 * neutral one, because it reads like it still means something specific.
 *
 * Borrowed text is also made gender-neutral before it goes out: records were
 * written with a typical caller in mind ("bring his DD-214"), and the person
 * reading this email may not be him.
 */

import { BUCKET_LABELS, type Bucket } from "@/lib/schemas";

/**
 * Money in any shape a staff member is likely to type. The amount is captured
 * whole, not just its first digit — the match goes into the resource's
 * verification log, and "$1" instead of "$1,200" would send whoever reads it
 * hunting for the wrong string.
 */
const MONEY =
  /\$\s*\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars|usd|bucks)\b/i;

/**
 * Phrases that promise an outcome or edge into claim advice. Deliberately
 * short and deliberately blunt — this is a screen on borrowed text, not a
 * language model. Anything it catches falls back to a neutral line, which
 * costs a sentence of detail and never costs a promise we can't keep.
 */
const RISKY =
  /\b(guarantee[sd]?|approv\w*|denied|back ?pay|rating|disability percentage|you (?:will|'ll) (?:get|receive|qualify)|file (?:a )?claim|should file|entitled to)\b/i;

/** Which screen a sentence tripped, and on what. */
export type ScreenTrip = {
  pattern: "money" | "outcome-or-claim";
  /** The text that matched, so a reviewer can find it in the record. */
  match: string;
};

/**
 * Screen a borrowed sentence. Null means it can go in front of a veteran
 * as-is; anything else names what stopped it and the words that did it.
 */
export function screenForPacket(text: string): ScreenTrip | null {
  const money = MONEY.exec(text);
  if (money) return { pattern: "money", match: money[0].trim() };
  const risky = RISKY.exec(text);
  if (risky) return { pattern: "outcome-or-claim", match: risky[0].trim() };
  return null;
}

/** True when a borrowed sentence can't go in front of a veteran as-is. */
export function isUnsafeForPacket(text: string): boolean {
  return screenForPacket(text) !== null;
}

export const SCREEN_PATTERN_LABELS: Record<ScreenTrip["pattern"], string> = {
  money: "a dollar figure",
  "outcome-or-claim": "outcome or claim language",
};

/** Keep the first letter's case when swapping a word. */
function matchCase(original: string, replacement: string): string {
  return original[0] === original[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;
}

/** "needs" → "need", "carries" → "carry", "goes" → "go" — agreeing a verb
 *  with "they". Only called on a word that followed "he" or "she". */
function pluralVerb(word: string): string {
  const lower = word.toLowerCase();
  if (lower === "is") return "are";
  if (lower === "was") return "were";
  if (lower === "has") return "have";
  if (lower === "does") return "do";
  if (lower === "doesn't") return "don't";
  if (lower === "isn't") return "aren't";
  if (lower === "wasn't") return "weren't";
  if (lower === "hasn't") return "haven't";
  if (/[^aeiou]ies$/.test(lower)) return word.slice(0, -3) + "y";
  if (lower === "focuses") return word.slice(0, -2);
  if (/(sses|shes|ches|xes|zes|oes)$/.test(lower)) return word.slice(0, -2);
  if (/[^s]s$/.test(lower)) return word.slice(0, -1);
  return word;
}

/**
 * Rewrite he/him/his (and she) as they/them/their, agreeing the verb that
 * follows. "Bring his DD-214" → "Bring their DD-214"; "he needs" → "they
 * need". "Her" is left alone — it can't be told apart from "their" vs "them"
 * without parsing, and the records that prompted this all say "he".
 */
export function neutralizePronouns(text: string): string {
  return text
    .replace(/\b(his or her|her or his|his\/her)\b/gi, (m) => matchCase(m, "their"))
    .replace(/\b(him or her|her or him|him\/her)\b/gi, (m) => matchCase(m, "them"))
    .replace(/\b(he or she|she or he|he\/she|s\/he)\b/gi, (m) => matchCase(m, "they"))
    .replace(/\b(himself|herself)\b/gi, (m) => matchCase(m, "themselves"))
    .replace(/\b(he|she)'s\b/gi, (m) => matchCase(m, "they're"))
    .replace(/\b(he|she)'(ll|d)\b/gi, (m, _p, rest) => matchCase(m, `they'${rest}`))
    // An adverb between pronoun and verb stays put; the verb after it agrees:
    // "he always brings" → "they always bring".
    .replace(
      /\b(he|she)\s+((?:[A-Za-z]+ly|always|also|never|often|still|just|only|then|now|sometimes|already|even|usually)\s+)?([A-Za-z']+)/gi,
      (_m, p: string, adverb: string | undefined, verb: string) =>
        `${matchCase(p, "they")} ${adverb ?? ""}${pluralVerb(verb)}`,
    )
    .replace(/\b(he|she)\b/gi, (m) => matchCase(m, "they"))
    .replace(/\bhim\b/gi, (m) => matchCase(m, "them"))
    .replace(/\bhis\b/gi, (m) => matchCase(m, "their"));
}

/** First sentence, trimmed to something that reads on one line. */
export function firstSentence(text: string, maxLength = 160): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  if (!flattened) return "";
  const end = flattened.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? flattened : flattened.slice(0, end + 1);
  if (sentence.length <= maxLength) return sentence;
  return `${sentence.slice(0, maxLength - 1).trimEnd()}…`;
}

/** What we say when the record's own words can't be used. */
const NEUTRAL_DESCRIPTION = "Ask them what they can help with.";

/**
 * The "what they do" line for one resource: the record's own words when they
 * are safe to pass on, and a neutral prompt when they are not.
 *
 * Reports the trip when it substitutes. A description carrying money or
 * outcome language is a bad record everywhere it appears, not just in this
 * packet — the caller writes it to the resource's verification log, and the
 * results screen tells the staff member reading the packet that a line was
 * replaced. A silent substitution would defeat the human read that is the
 * actual guarantee here.
 */
type DescribedField = "helpsWith" | "description" | "services";

export function describeResource(input: {
  helpsWith?: string | null;
  description?: string | null;
  services?: string | null;
}): { line: string; trip: (ScreenTrip & { field: DescribedField }) | null } {
  let firstTrip: (ScreenTrip & { field: DescribedField }) | null = null;

  // The plain-language line first: it was written for exactly this. The
  // description is for staff and tends to open with who they are ("Local
  // American Legion post."), which tells a veteran nothing about what to ask.
  for (const field of ["helpsWith", "description", "services"] as const) {
    const candidate = input[field];
    if (!candidate) continue;
    const sentence = firstSentence(neutralizePronouns(candidate));
    if (!sentence) continue;
    const trip = screenForPacket(sentence);
    if (!trip) return { line: sentence, trip: firstTrip };
    firstTrip ??= { ...trip, field };
  }

  return { line: NEUTRAL_DESCRIPTION, trip: firstTrip };
}

export type PacketResource = {
  organizationName: string;
  /** Plain-language "what they help with" — preferred for "What they do". */
  helpsWith?: string | null;
  /** Which needs it serves, to say which of the veteran's needs went
   *  unanswered. Optional: without it, nothing is reported missing. */
  buckets?: Bucket[];
  description?: string | null;
  services?: string | null;
  /** Eligibility the gates can't express, in the organization's own words. */
  eligibilityNotes?: string | null;
  accessMethod: "phone" | "web" | "walkin" | "referral";
  accessValue?: string | null;
  whatToBring?: string | null;
};

/**
 * Starts with a phone number — "423-855-6570", "(423) 855-6570", "211",
 * "988", "423-855-6570 (local) or 877-927-8387 (24/7)". An address
 * ("1300 Premier Drive") or an instruction ("Dial 211 and ask for…") doesn't.
 */
export function startsWithPhone(value: string): boolean {
  // 211/988 only count on their own or before a note — "411 Broad St" is an
  // address, not a call.
  return /^((\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}\b|([2-9]11|988)(?=\s*($|[(,;.]|or\s)))/.test(
    value.trim(),
  );
}

/** Free text as a sentence: capitalized, ending in punctuation. */
function asSentence(value: string): string {
  const text = value.trim();
  const capped = text[0].toUpperCase() + text.slice(1);
  return /[.!?)]$/.test(capped) ? capped : `${capped}.`;
}

/** How to start, phrased as an instruction the veteran can act on. */
export function startLine(resource: PacketResource): string {
  const raw = resource.accessValue?.trim();
  const value = raw ? neutralizePronouns(raw) : raw;
  switch (resource.accessMethod) {
    case "phone":
      // "Call" only goes in front of a number. A field that already holds
      // an instruction ("Dial 211 and ask for…") reads as-is.
      if (!value) return "Call them.";
      return startsWithPhone(value) ? `Call ${value}.` : asSentence(value);
    case "web":
      if (!value) return "Apply on their website.";
      return /^(https?:\/\/|www\.|[\w-]+\.[a-z]{2,}(\/|$))/i.test(value)
        ? `Apply online at ${value}.`
        : asSentence(value);
    case "walkin":
      if (!value) return "Walk in during opening hours.";
      if (startsWithPhone(value)) return `Walk in, or call ${value}.`;
      return /^\d/.test(value) ? `Walk in at ${value}.` : asSentence(value);
    case "referral":
      return value
        ? `Ask ${value} to refer you — they take referrals only.`
        : "They take referrals only. We'll help you line one up.";
  }
}

/**
 * Nobody should come away from this feeling handed off. A list of numbers can
 * read like "here, go away" — so the email says plainly that a dead end is
 * ours to fix, and that we're still here either way.
 */
const STAY_WITH_YOU = [
  "If any of these turn out to be a dead end, or they can't help, don't worry. That's not on you. Just let us know and we'll keep looking until we find something that works.",
  "We'll check back with you in two weeks to see how these went. You don't have to wait for us, either. Reply to this email any time.",
];

const FREE = "Everything is free. This doesn't cost you anything. Not now, not ever.";

const SIGNATURE = [
  "Cory Gold",
  "Executive Director, Worth Their Weight",
  "cory@worththeirweight.org",
];

const DISCLAIMER =
  "Worth Their Weight is not a law firm and does not provide legal representation before the U.S. Department of Veterans Affairs. All claims-related services are performed by VA-accredited attorneys, agents, or Veterans Service Organizations.";

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];

/** "five organizations that fit what you told me." */
function introLine(count: number): string {
  if (count === 1) return "Here is one organization that fits what you told me.";
  const n = NUMBER_WORDS[count] ?? String(count);
  return `Here are ${n} organizations that fit what you told me.`;
}

/** One line naming the needs nothing on the list covers, or null. */
export function uncoveredLine(needs: Bucket[], resources: PacketResource[]): string | null {
  if (!resources.every((r) => r.buckets)) return null;
  const covered = new Set(resources.flatMap((r) => r.buckets ?? []));
  const missing = needs.filter((need) => !covered.has(need));
  if (missing.length === 0) return null;
  const names = missing.map((b) => BUCKET_LABELS[b]).join(", ");
  return `We don't have an organization on this list yet for: ${names}. We're still looking.`;
}

/**
 * Build the packet.
 *
 * Deliberately plain text with no links or markup: it goes into a Gmail
 * compose window, and half of the people receiving it are reading on a
 * borrowed phone.
 */
export type PacketSubstitution = {
  resourceIndex: number;
  organizationName: string;
  field: DescribedField | "eligibilityNotes" | "whatToBring";
  pattern: ScreenTrip["pattern"];
  match: string;
};

export type ReferralPacket = {
  text: string;
  /** Every place a record's own words were replaced, and why. */
  substitutions: PacketSubstitution[];
};

export function buildReferralPacket(input: {
  firstName: string;
  resources: PacketResource[];
  /** What the veteran said they needed. Any not covered gets one line. */
  needs?: Bucket[];
}): ReferralPacket {
  const greeting = input.firstName.trim()
    ? `${input.firstName.trim()},`
    : "Hello,";

  const intro = introLine(input.resources.length);

  const substitutions: PacketSubstitution[] = [];

  const blocks = input.resources.map((resource, index) => {
    const described = describeResource(resource);
    if (described.trip) {
      substitutions.push({
        resourceIndex: index,
        organizationName: resource.organizationName,
        field: described.trip.field,
        pattern: described.trip.pattern,
        match: described.trip.match,
      });
    }

    const lines = [
      `${index + 1}. ${resource.organizationName}`,
      `   What they do: ${described.line}`,
    ];

    // Eligibility the eight gates couldn't hold — combat theater service,
    // military sexual trauma, and the rest. It reaches the veteran here or
    // nowhere, so it goes above "how to start": it's what decides whether
    // the call is worth making. Screened like any other borrowed sentence,
    // and dropped rather than replaced when it trips — there is no neutral
    // stand-in for "who they take" that says anything true.
    const notes = resource.eligibilityNotes
      ? neutralizePronouns(resource.eligibilityNotes).trim()
      : "";
    if (notes) {
      const trip = screenForPacket(notes);
      if (trip) {
        substitutions.push({
          resourceIndex: index,
          organizationName: resource.organizationName,
          field: "eligibilityNotes",
          pattern: trip.pattern,
          match: trip.match,
        });
      } else {
        // Longer than the other borrowed lines on purpose: eligibility is
        // usually a list, and a list cut at 160 characters reads as though
        // it ended.
        lines.push(`   Who they take: ${firstSentence(notes, 240)}`);
      }
    }

    lines.push(`   How to start: ${startLine(resource)}`);

    const bring = resource.whatToBring
      ? neutralizePronouns(resource.whatToBring).trim()
      : "";
    if (bring) {
      const trip = screenForPacket(bring);
      if (trip) {
        // Dropped rather than replaced: there is no neutral stand-in for
        // "what to bring" that says anything true.
        substitutions.push({
          resourceIndex: index,
          organizationName: resource.organizationName,
          field: "whatToBring",
          pattern: trip.pattern,
          match: trip.match,
        });
      } else {
        lines.push(`   Bring: ${firstSentence(bring)}`);
      }
    }

    return lines.join("\n");
  });

  const uncovered = uncoveredLine(input.needs ?? [], input.resources);

  const text = [
    greeting,
    "",
    FREE,
    "",
    intro,
    "",
    blocks.join("\n\n"),
    "",
    ...(uncovered ? [uncovered, ""] : []),
    ...STAY_WITH_YOU.flatMap((line) => [line, ""]),
    ...SIGNATURE,
    "",
    DISCLAIMER,
  ].join("\n");

  return { text, substitutions };
}

/** The text alone, for callers that don't care why a line was replaced. */
export function buildReferralText(input: {
  firstName: string;
  resources: PacketResource[];
  needs?: Bucket[];
}): string {
  return buildReferralPacket(input).text;
}
