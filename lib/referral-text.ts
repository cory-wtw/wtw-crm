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
 */

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
export function describeResource(input: {
  description?: string | null;
  services?: string | null;
}): { line: string; trip: (ScreenTrip & { field: "description" | "services" }) | null } {
  let firstTrip: (ScreenTrip & { field: "description" | "services" }) | null =
    null;

  for (const field of ["description", "services"] as const) {
    const candidate = input[field];
    if (!candidate) continue;
    const sentence = firstSentence(candidate);
    if (!sentence) continue;
    const trip = screenForPacket(sentence);
    if (!trip) return { line: sentence, trip: firstTrip };
    firstTrip ??= { ...trip, field };
  }

  return { line: NEUTRAL_DESCRIPTION, trip: firstTrip };
}

export type PacketResource = {
  organizationName: string;
  description?: string | null;
  services?: string | null;
  accessMethod: "phone" | "web" | "walkin" | "referral";
  accessValue?: string | null;
  whatToBring?: string | null;
};

/** How to start, phrased as an instruction the veteran can act on. */
export function startLine(resource: PacketResource): string {
  const value = resource.accessValue?.trim();
  switch (resource.accessMethod) {
    case "phone":
      return value ? `Call ${value}.` : "Call them.";
    case "web":
      return value ? `Apply online at ${value}.` : "Apply on their website.";
    case "walkin":
      return value ? `Walk in at ${value}.` : "Walk in during opening hours.";
    case "referral":
      return value
        ? `Ask ${value} to refer you — they take referrals only.`
        : "They take referrals only. We'll help you line one up.";
  }
}

const CHECK_BACK =
  "We'll check back with you in two weeks to see how these went.";

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
  field: "description" | "services" | "whatToBring";
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
}): ReferralPacket {
  const greeting = input.firstName.trim()
    ? `${input.firstName.trim()},`
    : "Hello,";

  const intro =
    input.resources.length === 1
      ? "Here's the organization we talked about."
      : `Here are the ${input.resources.length} organizations we talked about.`;

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
      `   How to start: ${startLine(resource)}`,
    ];

    const bring = resource.whatToBring?.trim();
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

  const text = [
    greeting,
    "",
    intro,
    "",
    blocks.join("\n\n"),
    "",
    CHECK_BACK,
    "",
    "Worth Their Weight",
    "Worth Their Weight is not a law firm and does not provide legal representation before the U.S. Department of Veterans Affairs. All claims-related services are performed by VA-accredited attorneys, agents, or Veterans Service Organizations.",
  ].join("\n");

  return { text, substitutions };
}

/** The text alone, for callers that don't care why a line was replaced. */
export function buildReferralText(input: {
  firstName: string;
  resources: PacketResource[];
}): string {
  return buildReferralPacket(input).text;
}
