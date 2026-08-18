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

/** Money in any shape a staff member is likely to type. */
const MONEY = /\$\s*\d|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars|usd|bucks)\b/i;

/**
 * Phrases that promise an outcome or edge into claim advice. Deliberately
 * short and deliberately blunt — this is a screen on borrowed text, not a
 * language model. Anything it catches falls back to a neutral line, which
 * costs a sentence of detail and never costs a promise we can't keep.
 */
const RISKY =
  /\b(guarantee[sd]?|approv\w*|denied|back ?pay|rating|disability percentage|you (?:will|'ll) (?:get|receive|qualify)|file (?:a )?claim|should file|entitled to)\b/i;

/** True when a borrowed sentence can't go in front of a veteran as-is. */
export function isUnsafeForPacket(text: string): boolean {
  return MONEY.test(text) || RISKY.test(text);
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
 */
export function describeResource(input: {
  description?: string | null;
  services?: string | null;
}): string {
  for (const candidate of [input.description, input.services]) {
    if (!candidate) continue;
    const sentence = firstSentence(candidate);
    if (sentence && !isUnsafeForPacket(sentence)) return sentence;
  }
  return NEUTRAL_DESCRIPTION;
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
export function buildReferralText(input: {
  firstName: string;
  resources: PacketResource[];
}): string {
  const greeting = input.firstName.trim()
    ? `${input.firstName.trim()},`
    : "Hello,";

  const intro =
    input.resources.length === 1
      ? "Here's the organization we talked about."
      : `Here are the ${input.resources.length} organizations we talked about.`;

  const blocks = input.resources.map((resource, index) => {
    const lines = [
      `${index + 1}. ${resource.organizationName}`,
      `   What they do: ${describeResource(resource)}`,
      `   How to start: ${startLine(resource)}`,
    ];
    const bring = resource.whatToBring?.trim();
    if (bring && !isUnsafeForPacket(bring)) {
      lines.push(`   Bring: ${firstSentence(bring)}`);
    }
    return lines.join("\n");
  });

  return [
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
}
