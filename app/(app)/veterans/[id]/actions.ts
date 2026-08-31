"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getResourcesByIds, listResources } from "@/lib/db/resources";
import { getSession } from "@/lib/firebase/session";
import {
  findCandidates,
  intakeFlags,
  passesGates,
  resourceFlags,
  type GateFailure,
  type MatchFlag,
  type MatchInput,
} from "@/lib/matching";
import {
  buildReferralPacket,
  SCREEN_PATTERN_LABELS,
  type PacketSubstitution,
} from "@/lib/referral-text";
import { stageVerification } from "@/lib/verifications";
import {
  canAccessCrm,
  canCreateReferral,
  canRunIntake,
} from "@/lib/permissions";
import {
  intakeSummary,
  matchNeeds,
  mergeEligibility,
  type EligibilityAnswers,
} from "@/lib/intake";
import {
  dependentsAnswerSchema,
  dischargeCharacterSchema,
  idStatusSchema,
  receivingVaBenefitsSchema,
  serviceEraSchema,
  bucketSchema,
  type AccessMethod,
  type Bucket,
  type ReferredResource,
  type TypicalWait,
  type VerificationStatus,
} from "@/lib/schemas";
import { z } from "zod";

/** How many candidates the review screen shows. */
const SHORT_LIST = 8;

/**
 * What the intake form submits.
 *
 * `safeTonight` is accepted and used, but never written: a crisis answer is
 * true at a moment, not about a person. It routes this call and then goes away.
 * `receivingVaBenefits` is the same — it decides whether the claims lane opens,
 * and claim history is on the "not stored, ever" list.
 */
const intakeInputSchema = z.object({
  safeTonight: z.boolean().optional(),
  receivingVaBenefits: receivingVaBenefitsSchema.optional(),
  needs: z.array(bucketSchema).default([]),
  dischargeCharacter: dischargeCharacterSchema.optional(),
  serviceEra: serviceEraSchema.optional(),
  idStatus: idStatusSchema.optional(),
  hasDependents: dependentsAnswerSchema.optional(),
});
export type IntakeInput = z.infer<typeof intakeInputSchema>;

/** One candidate, flattened for the client — no Firestore types cross over. */
export type Candidate = {
  id: string;
  organizationName: string;
  description: string | null;
  services: string | null;
  buckets: Bucket[];
  matchedBuckets: Bucket[];
  accessMethod: AccessMethod;
  accessValue: string | null;
  whatToBring: string | null;
  /** Eligibility the gates can't express. Descriptive: it never gated anything
   *  on the way here, and staff reads it before choosing. */
  eligibilityNotes: string | null;
  typicalWait: TypicalWait;
  verificationStatus: VerificationStatus;
  lastVerified: string | null;
  score: number;
  flags: MatchFlag[];
};

/** A resource that didn't make it, and why. Drives the "everything else" list. */
export type ExcludedResource = {
  id: string;
  organizationName: string;
  failures: GateFailure[];
};

export type IntakeResult = {
  candidates: Candidate[];
  /** The buckets staff checked on the call. Recorded on the referral encounter
   *  as bucketsIdentified — what the veteran said they needed, not what the
   *  short list happened to cover. */
  needs: Bucket[];
  excluded: ExcludedResource[];
  /** Flags about the intake itself, e.g. an unconfirmed discharge. */
  flags: MatchFlag[];
  /** True when the veteran has nowhere safe tonight — the screen leads with
   *  the Veterans Crisis Line and shows same-day options only. */
  crisis: boolean;
  /** No filing history, or unsure: route to an accredited partner. The system
   *  never assesses the claim. */
  claimsLane: boolean;
  /** How many resources were considered, for "8 of 40" on the screen. */
  consideredCount: number;
};

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map(
      (i) =>
        `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`,
    )
    .join("; ");
}

/**
 * Run a concierge intake: save the eligibility keys and the assessment, then
 * gate and rank the directory in memory and hand back a short list.
 *
 * Writes the four eligibility fields and an `intake` encounter — what staff
 * checked, the answers the gates ran against, and how many resources cleared
 * them. An intake that matched nobody is the one most worth keeping: it is the
 * only record that the call happened, and the only place a hole in the
 * directory is visible after the tab closes.
 *
 * It writes no referral and sends nothing. The encounter carries no
 * `followUpDue` and doesn't touch `conciergeStatus`, so it stays invisible to
 * the follow-up queue: a person deciding to send a packet is still the only
 * thing that puts a veteran in the loop.
 */
export async function runIntakeAction(
  veteranId: string,
  rawInput: unknown,
): Promise<
  { ok: true; result: IntakeResult } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false, error: "Your account doesn't have access to this." };
  }

  const parsed = intakeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const docRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  const existing = snap.data()!;

  if (!canRunIntake(session, { assigneeUid: existing.assigneeUid ?? null })) {
    return {
      ok: false,
      error: "You can only run intake for veterans assigned to you.",
    };
  }

  // Only the four eligibility keys are persisted. Everything else the form
  // collected routes this call and is then discarded.
  //
  // A blank answer means "not asked this time", never "clear it" — see
  // mergeEligibility. Skipping a question on a rushed follow-up call must not
  // wipe what a colleague collected in a better conversation.
  const now = new Date();
  const stored: EligibilityAnswers = {
    dischargeCharacter: existing.dischargeCharacter ?? undefined,
    serviceEra: existing.serviceEra ?? undefined,
    idStatus: existing.idStatus ?? undefined,
    hasDependents:
      typeof existing.hasDependents === "boolean"
        ? existing.hasDependents
          ? "yes"
          : "no"
        : (existing.hasDependents ?? undefined),
  };

  const { updates, effective } = mergeEligibility(stored, {
    dischargeCharacter: input.dischargeCharacter,
    serviceEra: input.serviceEra,
    idStatus: input.idStatus,
    hasDependents: input.hasDependents,
  });

  const eligibilityChanged = Object.keys(updates).length > 0;
  const eligibilityDiff = eligibilityChanged
    ? computeDiff(
        stored as Record<string, unknown>,
        updates as Record<string, unknown>,
        Object.keys(updates),
      )
    : null;

  // The veteran's own city and state come from their record — intake doesn't
  // re-ask what we already know.
  const matchInput: MatchInput = {
    safeTonight: input.safeTonight,
    state: existing.state ?? undefined,
    city: existing.city ?? undefined,
    // Everything we know, not just what was asked today — a question skipped
    // this call still matches on the answer given last week.
    dischargeCharacter: effective.dischargeCharacter,
    serviceEra: effective.serviceEra,
    idStatus: effective.idStatus,
    hasDependents: effective.hasDependents,
    receivingVaBenefits: input.receivingVaBenefits,
    // Nowhere safe tonight surfaces same-day help whatever else got checked.
    // The derivation stops here: `input.needs` is what staff ticked, and that
    // is what goes on the record.
    needs: matchNeeds(input.needs, input.safeTonight),
  };

  const resources = await listResources();
  const ranked = findCandidates(matchInput, resources, {
    limit: SHORT_LIST,
    now,
  });
  const shortListed = new Set(ranked.map((r) => r.resource.id));

  const candidates: Candidate[] = ranked.map(
    ({ resource, score, matchedBuckets }) => ({
      id: resource.id,
      organizationName: resource.organizationName,
      description: resource.description ?? null,
      services: resource.services ?? null,
      buckets: resource.buckets,
      matchedBuckets,
      accessMethod: resource.accessMethod,
      accessValue: resource.accessValue ?? null,
      whatToBring: resource.whatToBring ?? null,
      eligibilityNotes: resource.eligibilityNotes ?? null,
      typicalWait: resource.typicalWait,
      verificationStatus: resource.verificationStatus,
      lastVerified: resource.lastVerified?.toISOString() ?? null,
      score,
      flags: resourceFlags(matchInput, resource),
    }),
  );

  // Everything the gates dropped, with the reasons. Staff uses this to spot a
  // misconfigured record — and to add something back by hand when they know
  // better than the gate does.
  const excluded: ExcludedResource[] = resources
    .filter((r) => !shortListed.has(r.id))
    .map((r) => ({
      id: r.id,
      organizationName: r.organizationName,
      failures: passesGates(matchInput, r).failures,
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));

  // The assessment and the answers commit together. Splitting them would let a
  // call save four eligibility fields and lose every needs box that was ticked
  // to establish them — which is the failure this encounter exists to prevent.
  //
  // No followUpDue, no conciergeStatus: the follow-up queue reads those off the
  // veteran, so an intake stays out of it until a person approves a packet.
  const encounterRef = docRef.collection("encounters").doc();
  const batch = adminDb.batch();
  batch.set(encounterRef, {
    type: "intake",
    occurredAt: now,
    loggedBy: session.uid,
    summary: intakeSummary({
      needs: input.needs,
      candidatesFound: candidates.length,
      consideredCount: resources.length,
    }),
    // What staff checked, not what the matcher was handed.
    bucketsIdentified: input.needs,
    // Which of those needs the gates could actually answer. Recorded so the
    // roster gaps page can tell "asked for and nothing to offer" apart from
    // "asked for and served" — the difference is the whole list.
    bucketsMatched: [
      ...new Set(candidates.flatMap((candidate) => candidate.matchedBuckets)),
    ],
    // What the gates ran against — stored answers plus this call's. Absent by
    // design: safeTonight and receivingVaBenefits.
    // mergeEligibility only ever sets keys it has values for, so there is no
    // undefined in here for Firestore to reject.
    intakeAnswers: effective,
    candidatesFound: candidates.length,
    referrals: [],
    followUpDue: null,
    followUpCompleted: null,
    outcomes: [],
    createdAt: now,
  });
  if (eligibilityChanged) {
    batch.update(docRef, {
      ...updates,
      updatedBy: session.uid,
      updatedAt: now,
    });
  }
  await batch.commit();

  if (eligibilityDiff) {
    await logAudit({
      action: "update",
      resourceType: "veteran",
      resourceId: veteranId,
      diff: eligibilityDiff,
    });
  }
  await logAudit({
    action: "create",
    resourceType: "encounter",
    resourceId: `${veteranId}/${encounterRef.id}`,
    diff: {
      type: { before: null, after: "intake" },
      bucketsIdentified: { before: null, after: input.needs },
    },
  });

  revalidatePath(`/veterans/${veteranId}`);

  return {
    ok: true,
    result: {
      candidates,
      needs: input.needs,
      excluded,
      flags: intakeFlags(matchInput),
      crisis: input.safeTonight === false,
      claimsLane:
        input.receivingVaBenefits === "no" ||
        input.receivingVaBenefits === "unsure",
      consideredCount: resources.length,
    },
  };
}

/** Two weeks, per §5.2 — the follow-up queue reads this date. */
const FOLLOW_UP_DAYS = 14;

const referralInputSchema = z.object({
  bucketsIdentified: z.array(bucketSchema).default([]),
  referrals: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        // What the matcher put on the list staff actually saw. Recorded as
        // provenance, not recomputed: the ranking depended on answers (crisis,
        // above all) that are deliberately never stored.
        rank: z.number().int().nonnegative(),
        score: z.number(),
      }),
    )
    .min(1, "Pick at least one resource."),
});

export type ReferralResult = {
  encounterId: string;
  /** The block staff copies into an email and sends themselves. */
  referralText: string;
  followUpDue: string;
  /** Lines the screen replaced or dropped, so the person about to send the
   *  packet can see what isn't in it. A silent substitution would defeat the
   *  human read that is the actual guarantee. */
  substitutions: (PacketSubstitution & { resourceId: string })[];
};

/**
 * Approve a referral packet: write it to the veteran's timeline, put them in
 * the concierge loop, and hand back the text.
 *
 * This is the ONLY path that writes a referral, and it exists solely to be
 * called by a person clicking approve. Nothing sends the text — no mail
 * provider is configured and this action does not add one. Staff copies it into
 * their own mail client, reads it once more, and sends it themselves.
 */
export async function createReferralAction(
  veteranId: string,
  rawInput: unknown,
): Promise<
  { ok: true; result: ReferralResult } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false, error: "Your account doesn't have access to this." };
  }

  const parsed = referralInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  const veteranRef = adminDb.collection("veterans").doc(veteranId);
  const snap = await veteranRef.get();
  if (!snap.exists) return { ok: false, error: "Veteran not found." };
  const existing = snap.data()!;

  if (
    !canCreateReferral(session, { assigneeUid: existing.assigneeUid ?? null })
  ) {
    return {
      ok: false,
      error: "You can only send referrals for veterans assigned to you.",
    };
  }

  // Read the resources fresh rather than trusting names off the client: the
  // packet is a record of what the veteran was handed, and it should say what
  // the directory says.
  const resources = await getResourcesByIds(
    input.referrals.map((r) => r.resourceId),
  );
  const byId = new Map(resources.map((r) => [r.id, r]));

  const missing = input.referrals.filter((r) => !byId.has(r.resourceId));
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        "One of those resources no longer exists. Re-run the intake and try again.",
    };
  }

  const ordered = [...input.referrals].sort((a, b) => a.rank - b.rank);
  const referrals: ReferredResource[] = ordered.map((r) => ({
    resourceId: r.resourceId,
    resourceName: byId.get(r.resourceId)!.organizationName,
    rank: r.rank,
    score: r.score,
  }));

  const now = new Date();
  const followUpDue = new Date(
    now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000,
  );

  const packet = buildReferralPacket({
    firstName: existing.firstName ?? "",
    resources: ordered.map((r) => {
      const resource = byId.get(r.resourceId)!;
      return {
        organizationName: resource.organizationName,
        description: resource.description ?? null,
        services: resource.services ?? null,
        eligibilityNotes: resource.eligibilityNotes ?? null,
        accessMethod: resource.accessMethod,
        accessValue: resource.accessValue ?? null,
        whatToBring: resource.whatToBring ?? null,
      };
    }),
  });

  // Map each substitution back to the resource it came from, so both the
  // verification log and the results screen can name it.
  const substitutions = packet.substitutions.map((substitution) => ({
    ...substitution,
    resourceId: ordered[substitution.resourceIndex].resourceId,
  }));

  const encounterRef = veteranRef.collection("encounters").doc();

  // The encounter and the veteran's status commit together: a veteran marked
  // "referred" with no packet on their timeline would send the Phase 5 queue
  // chasing a follow-up nobody can see the contents of.
  const batch = adminDb.batch();
  batch.set(encounterRef, {
    type: "referral",
    occurredAt: now,
    loggedBy: session.uid,
    summary: `Sent ${referrals.length} ${
      referrals.length === 1 ? "resource" : "resources"
    }: ${referrals.map((r) => r.resourceName).join(", ")}`,
    bucketsIdentified: input.bucketsIdentified,
    referrals,
    followUpDue,
    followUpCompleted: null,
    createdAt: now,
  });
  batch.update(veteranRef, {
    conciergeStatus: "referred",
    followUpDue,
    updatedBy: session.uid,
    updatedAt: now,
  });

  // A description carrying money or outcome language is a bad record
  // everywhere it appears, not just in this packet. Log it against the
  // resource so it surfaces in review — but leave verificationStatus alone:
  // the record may be perfectly live and simply badly worded, and only a
  // human or a Phase 7 check may flag it.
  for (const substitution of substitutions) {
    stageVerification(
      batch,
      {
        resourceId: substitution.resourceId,
        checkType: "manual",
        result: "flag",
        detail: `Referral text screen: ${substitution.field} matched ${SCREEN_PATTERN_LABELS[substitution.pattern]} ("${substitution.match}"). The line was ${
          substitution.field === "whatToBring" ||
          substitution.field === "eligibilityNotes"
            ? "dropped from"
            : "replaced in"
        } a packet; the record still says it.`,
        checkedBy: session.uid,
      },
      now,
    );
  }

  await batch.commit();

  await logAudit({
    action: "create",
    resourceType: "encounter",
    resourceId: `${veteranId}/${encounterRef.id}`,
    diff: {
      referrals: {
        before: null,
        after: referrals.map((r) => r.resourceName),
      },
    },
  });

  revalidatePath(`/veterans/${veteranId}`);
  revalidatePath("/veterans");

  return {
    ok: true,
    result: {
      encounterId: encounterRef.id,
      referralText: packet.text,
      followUpDue: followUpDue.toISOString(),
      substitutions,
    },
  };
}
