import { z } from "zod";
import { type Bucket } from "./bucket";

/**
 * Concrete things a veteran walked away with — the "is anyone better off?"
 * half of WTW's impact, beyond VA benefits.
 *
 * Deliberately specific ("got a job", not "work helped"): a vague "got help"
 * can't be counted or reported, and a funder asks how many people got housed,
 * not how many were helped with housing. Each kind sits under one of the need
 * buckets so the report can group by the same vocabulary as intake.
 *
 * `value` says what dollar figure, if any, staff are asked for: a monthly
 * amount for something that pays every month (wages, SNAP, SSI), a one-time
 * amount for a single payout (rent assistance, a car repair), or none when a
 * count is the honest measure (a voucher, an ID).
 */
export const OUTCOME_KINDS = [
  "housedPermanent",
  "housedTemporary",
  "keptHousing",
  "housingVoucher",
  "job",
  "school",
  "certification",
  "snap",
  "ssiSsdi",
  "otherIncome",
  "financialAssistance",
  "vaHealthEnrolled",
  "healthCare",
  "mentalHealthCare",
  "idOrDocuments",
  "dischargeUpgrade",
  "legalResolved",
  "transportation",
  "phoneOrInternet",
  "essentials",
  "familySupport",
  "other",
] as const;
export const outcomeKindSchema = z.enum(OUTCOME_KINDS);
export type OutcomeKind = z.infer<typeof outcomeKindSchema>;

export type OutcomeValue = "monthly" | "oneTime" | null;

export const OUTCOME_KIND_INFO: Record<
  OutcomeKind,
  { label: string; bucket: Bucket | null; value: OutcomeValue }
> = {
  housedPermanent: { label: "Moved into permanent housing", bucket: "housing", value: null },
  housedTemporary: { label: "Got into shelter or transitional housing", bucket: "housing", value: null },
  keptHousing: { label: "Kept their housing (eviction avoided)", bucket: "housing", value: null },
  housingVoucher: { label: "Got a housing voucher (HUD-VASH, Section 8)", bucket: "housing", value: null },
  job: { label: "Got a job", bucket: "work", value: "monthly" },
  school: { label: "Started school or job training", bucket: "work", value: null },
  certification: { label: "Earned a certification or license", bucket: "work", value: null },
  snap: { label: "Started getting SNAP (food stamps)", bucket: "income", value: "monthly" },
  ssiSsdi: { label: "Started getting SSI or SSDI", bucket: "income", value: "monthly" },
  otherIncome: { label: "Other new monthly income", bucket: "income", value: "monthly" },
  financialAssistance: { label: "Rent, utility, or emergency money paid", bucket: "income", value: "oneTime" },
  vaHealthEnrolled: { label: "Enrolled in VA health care", bucket: "health", value: null },
  healthCare: { label: "Saw a doctor or dentist", bucket: "health", value: null },
  mentalHealthCare: { label: "Started counseling or recovery", bucket: "mental", value: null },
  idOrDocuments: { label: "Got an ID, DD-214, or birth certificate", bucket: "legal", value: null },
  dischargeUpgrade: { label: "Discharge upgraded", bucket: "legal", value: null },
  legalResolved: { label: "Legal issue resolved", bucket: "legal", value: null },
  transportation: { label: "Got a ride, bus pass, or car repair", bucket: "transport", value: "oneTime" },
  phoneOrInternet: { label: "Got a phone or internet", bucket: "transport", value: null },
  essentials: { label: "Got food, clothes, or household items", bucket: "essentials", value: "oneTime" },
  familySupport: { label: "Got childcare or caregiver support", bucket: "family", value: null },
  other: { label: "Something else", bucket: null, value: "oneTime" },
};

export const OUTCOME_VALUE_PROMPTS: Record<"monthly" | "oneTime", string> = {
  monthly: "About how much a month? (optional)",
  oneTime: "About how much was it worth? (optional)",
};

/**
 * Did WTW help? Asked on every win, because a funder will ask it about every
 * number. A veteran who found a job on their own still belongs on the record —
 * it's good news and it changes what they need — but it isn't ours to report.
 *
 * Missing on wins logged before the question existed. Those read as
 * unconfirmed: not counted as WTW's until somebody answers.
 */
export const WTW_ROLES = ["led", "helped", "none"] as const;
export const wtwRoleSchema = z.enum(WTW_ROLES);
export type WtwRole = z.infer<typeof wtwRoleSchema>;

export const WTW_ROLE_LABELS: Record<WtwRole, string> = {
  led: "Yes, WTW made it happen",
  helped: "WTW helped",
  none: "No, they did it on their own",
};

/** Short tag for the timeline. */
export const WTW_ROLE_TAGS: Record<WtwRole | "unconfirmed", string> = {
  led: "WTW made it happen",
  helped: "WTW helped",
  none: "On their own",
  unconfirmed: "Did WTW help? Not answered",
};

/** Whether a win counts toward WTW's reported impact. Unanswered doesn't. */
export function creditsWtw(role: WtwRole | undefined): boolean {
  return role === "led" || role === "helped";
}

/** One win, as it sits on the veteran record. */
export const veteranOutcomeSchema = z.object({
  id: z.string().min(1),
  kind: outcomeKindSchema,
  achievedAt: z.date(),
  /** Dollars a month, for kinds whose `value` is monthly. */
  monthlyValue: z.number().nonnegative().optional(),
  /** Dollars once, for kinds whose `value` is oneTime. */
  oneTimeValue: z.number().nonnegative().optional(),
  /** The resource that made it happen, when there was one. Name is a
   *  snapshot for the same reason referral packets keep one. */
  resourceId: z.string().optional(),
  resourceName: z.string().optional(),
  /** Did WTW help? Absent means nobody answered yet. */
  wtwRole: wtwRoleSchema.optional(),
  note: z.string().optional(),
  loggedBy: z.string(),
  loggedAt: z.date(),
});
export type VeteranOutcome = z.infer<typeof veteranOutcomeSchema>;

/** What staff submit when logging a win by hand or from a follow-up. */
export const outcomeInputSchema = z.object({
  kind: outcomeKindSchema,
  achievedAt: z.coerce.date(),
  amount: z.number().nonnegative().optional(),
  resourceId: z.string().optional(),
  wtwRole: wtwRoleSchema,
  note: z.string().max(500).optional(),
});
export type OutcomeInput = z.infer<typeof outcomeInputSchema>;

/** Puts a submitted amount in the right field for the kind, and drops it when
 *  the kind doesn't take one. */
export function outcomeAmounts(
  kind: OutcomeKind,
  amount: number | undefined,
): { monthlyValue?: number; oneTimeValue?: number } {
  if (!amount) return {};
  const value = OUTCOME_KIND_INFO[kind].value;
  if (value === "monthly") return { monthlyValue: amount };
  if (value === "oneTime") return { oneTimeValue: amount };
  return {};
}

/** One line for the timeline: "Got a job — $2,400/mo, via Goodwill." */
export function outcomeSummary(
  o: Pick<VeteranOutcome, "kind" | "monthlyValue" | "oneTimeValue" | "resourceName" | "note">,
): string {
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  let line = OUTCOME_KIND_INFO[o.kind].label;
  if (o.monthlyValue) line += ` — ${usd(o.monthlyValue)}/mo`;
  if (o.oneTimeValue) line += ` — ${usd(o.oneTimeValue)}`;
  if (o.resourceName) line += `, via ${o.resourceName}`;
  line += ".";
  if (o.note) line += ` ${o.note}`;
  return line;
}
