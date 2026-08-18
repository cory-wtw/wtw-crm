import { z } from "zod";
import { bucketSchema, minDischargeSchema, serviceEraSchema } from "./bucket";

// A Community Resource is an outside organization we can point veterans to —
// food banks, rent-assistance funds, housing programs, etc. It's a searchable
// directory keyed on what the org actually does, so staff can look up a need
// ("rent assistance") and surface the orgs that offer it.
//
// It is also the matching corpus. The gate fields below are what the concierge
// matcher filters on: they are hard eligibility, boolean only, no scoring. A
// wrong gate value silently misroutes a veteran, so every one of them defaults
// to the permissive value — a record nobody has classified yet is treated as
// unrestricted rather than quietly excluded from every match.

/** How a veteran actually starts with this org. */
export const ACCESS_METHODS = ["phone", "web", "walkin", "referral"] as const;
export const accessMethodSchema = z.enum(ACCESS_METHODS);
export type AccessMethod = z.infer<typeof accessMethodSchema>;

export const ACCESS_METHOD_LABELS: Record<AccessMethod, string> = {
  phone: "Call",
  web: "Apply online",
  walkin: "Walk in",
  referral: "Referral required",
};

/** How long from first contact to being seen. */
export const TYPICAL_WAITS = [
  "sameday",
  "days",
  "weeks",
  "months",
  "unknown",
] as const;
export const typicalWaitSchema = z.enum(TYPICAL_WAITS);
export type TypicalWait = z.infer<typeof typicalWaitSchema>;

export const TYPICAL_WAIT_LABELS: Record<TypicalWait, string> = {
  sameday: "Same day",
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  unknown: "Unknown",
};

/**
 * How wide this resource's service area is.
 *
 * Three scopes, not four: `metro` and `county` were the same gate wearing two
 * names — both mean "these particular places", both check `geoLocalities`, and
 * asking staff to pick between them invited a wrong answer with no upside. The
 * merged value is `local`, and legacy `metro` / `county` records read forward
 * to it in lib/db/resources.ts.
 */
export const GEO_SCOPES = ["national", "state", "local"] as const;
export const geoScopeSchema = z.enum(GEO_SCOPES);
export type GeoScope = z.infer<typeof geoScopeSchema>;

export const GEO_SCOPE_LABELS: Record<GeoScope, string> = {
  national: "National",
  state: "Statewide",
  local: "Specific cities or counties",
};

/** Scopes that only serve named places, and so need `geoLocalities` filled in. */
export function isSubStateScope(scope: GeoScope): boolean {
  return scope === "local";
}

/**
 * Verification state. Only `live` and `aging` appear in matches; `aging` ranks
 * lower. `flagged` and `retired` are withheld until a human resolves them.
 *
 * Nothing is ever auto-retired — flags go to a human queue. A false positive
 * that silently removes a good resource is worse than a stale record, because
 * nobody ever finds out.
 */
export const VERIFICATION_STATUSES = [
  "live",
  "aging",
  "flagged",
  "retired",
] as const;
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  live: "Live",
  aging: "Aging",
  flagged: "Flagged",
  retired: "Retired",
};

/**
 * How likely this record is to rot. `stable` is VA facilities, federal
 * programs, large national nonprofits; `fragile` is small nonprofits,
 * single-site programs, anything grant-dependent. The batch verifier walks
 * fragile records more often, which is why the tag is set at entry.
 */
export const FRAGILITIES = ["stable", "fragile"] as const;
export const fragilitySchema = z.enum(FRAGILITIES);
export type Fragility = z.infer<typeof fragilitySchema>;

export const FRAGILITY_LABELS: Record<Fragility, string> = {
  stable: "Stable",
  fragile: "Fragile",
};

/** Days after which a `live` record reads as `aging`. */
export const AGING_AFTER_DAYS = 90;

/**
 * Days after which a record is stale enough to rank last.
 *
 * This is a RANKING threshold, not a gate. A record this old still matches and
 * is still shown — it just scores 0 on freshness (Phase 2 ranking: 60 under
 * 90d, 30 for 90–180d, 0 past this) and therefore sorts below fresher options.
 * Nothing here removes it from the corpus.
 */
export const STALE_AFTER_DAYS = 180;

export const resourceSchema = z.object({
  id: z.string(),
  organizationName: z.string().min(1, "Required"),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  services: z.string().optional(),

  // --- Gates. Hard eligibility, evaluated boolean-only by lib/matching. ---

  /** Which needs this org actually serves. No overlap with the veteran's
   *  needs means no match, so an unclassified record matches nothing. */
  buckets: z.array(bucketSchema).default([]),

  geoScope: geoScopeSchema.default("national"),
  /** Two-letter state codes. Empty when national. */
  geoStates: z.array(z.string()).default([]),
  /** Cities or counties, for metro and county scope. */
  geoLocalities: z.array(z.string()).default([]),

  /** Floor on character of discharge, inclusive upward. */
  minDischarge: minDischargeSchema.default("any"),
  requiresVaEnrollment: z.boolean().default(false),
  requiresValidId: z.boolean().default(false),
  /** Empty means unrestricted. */
  eraRestriction: z.array(serviceEraSchema).default([]),
  requiresDependents: z.boolean().default(false),
  /** Same-day intake available. The only resources surfaced when a veteran
   *  has nowhere safe tonight. */
  crisisCapable: z.boolean().default(false),

  // --- Access. How a veteran starts. Ranking signal, not a gate. ---

  accessMethod: accessMethodSchema.default("phone"),
  /** Number, URL, or address, matching accessMethod. */
  accessValue: z.string().optional(),
  whatToBring: z.string().optional(),
  typicalWait: typicalWaitSchema.default("unknown"),

  // --- Verification. Freshness of the record itself. ---

  verificationStatus: verificationStatusSchema.default("live"),
  fragility: fragilitySchema.default("stable"),
  lastVerified: z.date().nullable().default(null),
  /** uid of whoever last confirmed this record, or "system". */
  lastVerifiedBy: z.string().optional(),
  /** Hash of the fetched page, for the content-diff check. */
  contentHash: z.string().optional(),
  flagReason: z.string().optional(),
  /** Where the record came from — a grant list, an API, a phone call. */
  sourceName: z.string().optional(),

  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Resource = z.infer<typeof resourceSchema>;

/**
 * Fields a user supplies when creating or editing a resource.
 *
 * `lastVerified` / `lastVerifiedBy` are stamped by the server when a human
 * marks a record live, and `contentHash` / `flagReason` are written by the
 * batch verifier — none of them are typed into the form.
 */
/**
 * A geography gate with nothing to match against excludes everybody, silently.
 * A `local` record with no localities, or any scoped record with no states,
 * looks configured and answers "no" to every veteran — the worst kind of bug in
 * this system, because nothing surfaces and nobody finds out.
 */
function refineGeography(
  data: { geoScope: GeoScope; geoStates: string[]; geoLocalities: string[] },
  ctx: z.RefinementCtx,
): void {
  if (data.geoScope === "national") return;

  if (data.geoStates.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geoStates"],
      message:
        "Add at least one state, or switch the service area to National.",
    });
  }

  if (isSubStateScope(data.geoScope) && data.geoLocalities.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geoLocalities"],
      message:
        "List the cities or counties served, or widen the service area to Statewide.",
    });
  }
}

export const resourceInputSchema = resourceSchema
  .omit({
    id: true,
    lastVerified: true,
    lastVerifiedBy: true,
    contentHash: true,
    flagReason: true,
    createdBy: true,
    createdAt: true,
    updatedBy: true,
    updatedAt: true,
  })
  .superRefine(refineGeography);
export type ResourceInput = z.infer<typeof resourceInputSchema>;

/**
 * Age a record's verification status from `lastVerified`, at read time.
 *
 * There is no scheduler, so the one purely time-based transition in the status
 * diagram is derived rather than written:
 *
 *   live --(90d)--> aging
 *
 * That is the whole of it. Aging never ripens into `flagged` on its own: a
 * stale record keeps matching and is handled by ranking, which scores freshness
 * 0 past STALE_AFTER_DAYS so it sorts last instead of disappearing. Dropping a
 * resource out of the corpus because a clock ran is exactly the silent removal
 * nobody ever finds out about.
 *
 * `flagged` is reachable only two ways, both of which write a `verifications`
 * doc: a human decision, or a Phase 7 check. Neither happens here.
 *
 * The stored value is never mutated by this — a record a human set to `live`
 * stays `live` in Firestore and simply reads as `aging` once it goes stale.
 */
export function derivedVerificationStatus(
  stored: VerificationStatus,
  lastVerified: Date | null | undefined,
  now: Date = new Date(),
): VerificationStatus {
  if (stored !== "live") return stored;
  if (!lastVerified) return stored;

  const days = (now.getTime() - lastVerified.getTime()) / 86_400_000;
  return days >= AGING_AFTER_DAYS ? "aging" : "live";
}

/** Whether a resource is fresh enough to appear in matches. */
export function isMatchable(status: VerificationStatus): boolean {
  return status === "live" || status === "aging";
}
