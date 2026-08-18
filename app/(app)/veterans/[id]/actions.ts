"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { listResources } from "@/lib/db/resources";
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
import { canAccessCrm, canRunIntake } from "@/lib/permissions";
import {
  dischargeCharacterSchema,
  idStatusSchema,
  receivingVaBenefitsSchema,
  serviceEraSchema,
  bucketSchema,
  type AccessMethod,
  type Bucket,
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
  hasDependents: z.boolean().optional(),
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
 * Run a concierge intake: save the eligibility keys, then gate and rank the
 * directory in memory and hand back a short list.
 *
 * Writes nothing but the veteran's four eligibility fields. No encounter, no
 * referral, no message to anybody — a person decides what happens next.
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
  const now = new Date();
  const eligibility = {
    dischargeCharacter: input.dischargeCharacter ?? null,
    serviceEra: input.serviceEra ?? null,
    idStatus: input.idStatus ?? null,
    hasDependents: input.hasDependents ?? null,
  };

  const diff = computeDiff(
    existing as Record<string, unknown>,
    eligibility as unknown as Record<string, unknown>,
    Object.keys(eligibility),
  );

  await docRef.update({
    ...eligibility,
    updatedBy: session.uid,
    updatedAt: now,
  });

  if (Object.keys(diff).length > 0) {
    await logAudit({
      action: "update",
      resourceType: "veteran",
      resourceId: veteranId,
      diff,
    });
  }

  // The veteran's own city and state come from their record — intake doesn't
  // re-ask what we already know.
  const matchInput: MatchInput = {
    safeTonight: input.safeTonight,
    state: existing.state ?? undefined,
    city: existing.city ?? undefined,
    dischargeCharacter: input.dischargeCharacter,
    serviceEra: input.serviceEra,
    idStatus: input.idStatus,
    hasDependents: input.hasDependents,
    receivingVaBenefits: input.receivingVaBenefits,
    needs: input.needs,
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

  revalidatePath(`/veterans/${veteranId}`);

  return {
    ok: true,
    result: {
      candidates,
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
