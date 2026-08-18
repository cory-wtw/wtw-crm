/**
 * AI enrichment: turning a web page into a proposed resource record.
 *
 * Pure functions, no I/O. Everything here is the part that has to be right
 * whatever the model returns — page-text extraction, defensive parsing, and
 * the shape the proposal must fit before a human ever sees it.
 *
 * The governing rule: a field the page doesn't answer comes back `null`, never
 * a guess. A null prompts a person; a guess is a silent error nobody finds,
 * and a wrong gate value quietly misroutes veterans for as long as it sits
 * there.
 */

import { z } from "zod";
import {
  accessMethodSchema,
  bucketSchema,
  geoScopeSchema,
  minDischargeSchema,
  serviceEraSchema,
  typicalWaitSchema,
} from "@/lib/schemas";

/** Cap on the page text sent to the model. */
export const MAX_PAGE_CHARS = 24_000;

/**
 * Readable text from an HTML document.
 *
 * Deliberately crude — script and style contents dropped, tags stripped, the
 * handful of entities that actually show up decoded, whitespace collapsed. A
 * real parser would read better and cost a dependency; the model tolerates
 * rough text, and the reviewer sees exactly what it saw.
 */
export function htmlToText(html: string, maxChars = MAX_PAGE_CHARS): string {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block-level ends become breaks so headings and list items don't fuse.
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}

/**
 * Pull a JSON object out of whatever the model actually sent.
 *
 * The prompt demands bare JSON, and this assumes it didn't get it: fences are
 * stripped, a leading "Here's the JSON:" is skipped by seeking the first brace,
 * and a trailing sign-off is cut at the matching one. None of that is
 * hypothetical — it is the ordinary failure mode of asking for JSON in prose.
 *
 * Returns null rather than throwing; the caller reports which URL failed and
 * keeps going.
 */
export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;

  let text = raw.trim();

  // ```json … ``` or ``` … ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  if (start === -1) return null;

  // Walk to the brace that closes the first one, ignoring braces inside
  // strings — a description containing "{" would otherwise truncate the parse.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Every field is nullable: null means the page didn't say. */
const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable().catch(null);

/**
 * What we ask the model for.
 *
 * `.catch(null)` on every field is deliberate: a model that returns "maybe" for
 * a boolean, or invents a bucket code, degrades that one field to "unanswered"
 * rather than failing the whole proposal. A partly-filled proposal a human
 * completes beats a rejected one that sends them to the full form.
 *
 * Note what the arrays do NOT do: a bad list degrades to null, not to []. An
 * empty array is a claim — "serves none of these" — and letting a parse failure
 * make that claim is the silent default this whole design exists to prevent.
 */
export const proposalSchema = z.object({
  name: nullable(z.string().min(1)),
  parentOrg: nullable(z.string().min(1)),
  description: nullable(z.string().min(1)),

  // The ten §2.2 gate fields.
  buckets: z.array(bucketSchema).nullable().catch(null),
  geoScope: nullable(geoScopeSchema),
  geoStates: z.array(z.string()).nullable().catch(null),
  geoLocalities: z.array(z.string()).nullable().catch(null),
  minDischarge: nullable(minDischargeSchema),
  requiresVaEnrollment: nullable(z.boolean()),
  requiresValidId: nullable(z.boolean()),
  eraRestriction: z.array(serviceEraSchema).nullable().catch(null),
  requiresDependents: nullable(z.boolean()),
  crisisCapable: nullable(z.boolean()),

  accessMethod: nullable(accessMethodSchema),
  accessValue: nullable(z.string().min(1)),
  whatToBring: nullable(z.string().min(1)),
  typicalWait: nullable(typicalWaitSchema),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Parse a model response into a proposal, or null if there's nothing usable. */
export function parseProposal(raw: string): Proposal | null {
  const json = extractJsonObject(raw);
  if (!json || typeof json !== "object") return null;
  const parsed = proposalSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Fields the model left unanswered, for the reviewer to resolve. */
export function unansweredFields(proposal: Proposal): string[] {
  return Object.entries(proposal)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
}

/**
 * A URL reduced to what identifies the page, for a stable external id.
 *
 * Scheme and host lowercased, a default port and trailing slash dropped, the
 * fragment removed — so the same page pasted three ways enriches once. Query
 * strings are kept: plenty of directory pages put the identity there.
 */
export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

/**
 * Hosts a server-side fetcher must never be pointed at.
 *
 * This runs on Cloud Run, where 169.254.169.254 is the metadata server — a
 * pasted link to it would put instance credentials into page text, a model
 * prompt, and a Firestore document in one move. Loopback and private ranges go
 * with it: nothing a veteran can reach lives there.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal" || host.endsWith(".internal")) {
    return true;
  }
  if (host === "::1" || host === "0.0.0.0") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. the metadata IP
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return true; // any other bare IPv4 literal: no legitimate resource is one
}

/** Split a pasted block into normalized, de-duplicated URLs. */
export function parseUrlList(input: string): {
  urls: string[];
  invalid: string[];
} {
  const urls: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const line of input.split(/[\n,]/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const normalized = normalizeUrl(trimmed);
    if (!normalized) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return { urls, invalid };
}

/**
 * A proposal as resource input, with every unanswered field at the schema's
 * permissive default.
 *
 * One definition, used by the review form to seed itself and by the script to
 * write directly — so what a reviewer sees pre-filled and what a batch run
 * stores are the same thing. Permissive matters: an unanswered gate defaulting
 * to `true` would hide the resource on a fact nobody established.
 */
export function proposalToInput(proposal: Proposal, url: string) {
  return {
    organizationName: proposal.name ?? "",
    parentOrg: proposal.parentOrg ?? undefined,
    description: proposal.description ?? undefined,
    website: url,
    buckets: proposal.buckets ?? [],
    geoScope: proposal.geoScope ?? "national",
    geoStates: proposal.geoStates ?? [],
    geoLocalities: proposal.geoLocalities ?? [],
    minDischarge: proposal.minDischarge ?? "any",
    requiresVaEnrollment: proposal.requiresVaEnrollment ?? false,
    requiresValidId: proposal.requiresValidId ?? false,
    eraRestriction: proposal.eraRestriction ?? [],
    requiresDependents: proposal.requiresDependents ?? false,
    crisisCapable: proposal.crisisCapable ?? false,
    accessMethod: proposal.accessMethod ?? "phone",
    accessValue: proposal.accessValue ?? undefined,
    whatToBring: proposal.whatToBring ?? undefined,
    typicalWait: proposal.typicalWait ?? "unknown",
    verificationStatus: "flagged" as const,
    fragility: "fragile" as const,
  };
}

// --- One-hop crawl -------------------------------------------------------
//
// A landing page says what an organization is; it rarely says who it turns
// away. Eligibility, discharge floors, and enrollment requirements live a click
// down, under "who we serve" or "eligibility" or a FAQ. Reading only the entry
// page therefore nulls exactly the fields that decide whether a referral works.

export type PageLink = {
  url: string;
  /** The anchor text, normalized — the strongest signal about what's behind it. */
  text: string;
};

/**
 * Internal links from a page, same host only.
 *
 * Same-host is a hard rule, not a heuristic: an external link is somebody
 * else's claim about this organization, and following one would let any page
 * point our fetcher wherever it liked.
 */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const anchors = html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  );

  const seen = new Set<string>();
  const links: PageLink[] = [];

  for (const match of anchors) {
    const href = match[1].trim();
    if (
      !href ||
      href.startsWith("#") ||
      /^(mailto:|tel:|javascript:|data:)/i.test(href)
    ) {
      continue;
    }

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    // Documents and media: the extractor can't read them and the model
    // shouldn't be handed bytes it will hallucinate over.
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg|mp4|mp3)$/i.test(resolved.pathname)) {
      continue;
    }

    const url = normalizeUrl(resolved.toString());
    const self = normalizeUrl(baseUrl);
    if (!url) continue;
    // Dedupe case-insensitively — a site linking both Eligibility.asp and
    // eligibility.asp otherwise burns two of the five crawl slots on one page.
    // The first spelling seen is what gets fetched, because some servers do
    // care about case even when their own links don't.
    const key = url.toLowerCase();
    if (self && key === self.toLowerCase()) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    links.push({ url, text });
  }

  return links;
}

/**
 * What we're hunting for, and what it's worth.
 *
 * Weighted by which gate the page behind the link is likely to answer.
 * Eligibility outranks everything because `minDischarge` and
 * `requiresVaEnrollment` are the two fields that decide whether a veteran gets
 * through the door, and they are almost never on a landing page.
 */
const LINK_SIGNALS: { pattern: RegExp; weight: number }[] = [
  { pattern: /eligib|who (we serve|is eligible|qualifies)|qualif|requirements/i, weight: 100 },
  { pattern: /\bapply\b|how (to|do i) (get|start|apply)|getting started|get help|intake/i, weight: 70 },
  { pattern: /services|programs|what we (do|offer)|support/i, weight: 55 },
  { pattern: /\bfaq\b|frequently asked|questions/i, weight: 45 },
  // Not a bare "center": on vetcenter.va.gov every page says "Vet Center",
  // which scored a call-centre PSA page into the crawl's link list.
  {
    pattern: /locations?|find (a|an|us|your)\b|near you|directory|locator/i,
    weight: 35,
  },
  { pattern: /contact|reach us|phone/i, weight: 25 },
  { pattern: /about/i, weight: 15 },
];

/** Noise that reliably answers none of the gates. */
const LINK_PENALTIES =
  /privacy|terms|cookie|accessibility|sitemap|donate|volunteer|news|blog|press|events|careers|jobs|shop|store|login|sign ?in|search|espanol|español/i;

/** How likely this link leads to a page that answers a gate. 0 means skip it. */
export function scoreLink(link: PageLink): number {
  const haystack = `${link.text} ${decodeURIComponent(link.url)}`;
  if (LINK_PENALTIES.test(haystack)) return 0;

  let score = 0;
  for (const signal of LINK_SIGNALS) {
    if (signal.pattern.test(haystack)) score += signal.weight;
  }
  // A link whose anchor text says nothing ("click here", "") is a coin flip;
  // keep it only if the href itself matched something.
  if (score > 0 && link.text.length < 3) score -= 10;
  return Math.max(0, score);
}

export type ScoredLink = PageLink & { score: number };

/** The most promising links, highest first. */
export function rankLinks(links: PageLink[], limit: number): ScoredLink[] {
  return links
    .map((link) => ({ ...link, score: scoreLink(link) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit);
}

/** Total characters of page text handed to the model in one pass. */
export const MAX_COMBINED_CHARS = 60_000;

export type FetchedPage = { url: string; text: string };

/**
 * One labelled block of text from several pages, entry page first.
 *
 * Labelling by URL matters for more than provenance: it lets the model say
 * which page a fact came from, and lets a reviewer check it. The cap is spent
 * in order, so a long entry page never gets truncated in favour of a FAQ.
 */
export function combinePages(
  pages: FetchedPage[],
  maxChars = MAX_COMBINED_CHARS,
): string {
  const blocks: string[] = [];
  let budget = maxChars;

  for (const page of pages) {
    if (budget <= 0) break;
    const header = `\n===== PAGE: ${page.url}\n`;
    const room = budget - header.length;
    if (room <= 200) break;
    const body =
      page.text.length > room ? `${page.text.slice(0, room)}\n…[truncated]` : page.text;
    blocks.push(`${header}${body}`);
    budget -= header.length + body.length;
  }

  return blocks.join("\n").trim();
}
