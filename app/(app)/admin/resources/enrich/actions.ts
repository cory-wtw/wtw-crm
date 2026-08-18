"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import {
  ENRICH_SOURCE,
  enrichUrl,
  upsertEnrichedResource,
  type EnrichedPage,
} from "@/lib/enrich-runner";
import { getSession } from "@/lib/firebase/session";
import { canApproveImportedResource } from "@/lib/permissions";
import { resourceInputSchema } from "@/lib/schemas";

/**
 * Thin wrappers over lib/enrich-runner. The pipeline lives there so
 * scripts/enrich-urls.ts runs the same fetch, prompt, parser, and hashing
 * rather than a second copy that drifts.
 */

export type EnrichResult = EnrichedPage;

async function requireApprover() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (!canApproveImportedResource(session)) {
    return { ok: false as const, error: "Admins only." };
  }
  return { ok: true as const, session };
}

/**
 * Read one page and propose a record. Writes nothing — approval is separate
 * and explicit.
 */
export async function enrichUrlAction(
  rawUrl: unknown,
): Promise<{ ok: true; result: EnrichResult } | { ok: false; error: string }> {
  const guard = await requireApprover();
  if (!guard.ok) return guard;
  if (typeof rawUrl !== "string") return { ok: false, error: "No URL given." };
  return enrichUrl(rawUrl);
}

/**
 * Write a draft the human has reviewed.
 *
 * The input is what's on screen after editing, never what the model said — the
 * proposal is a draft, and this action doesn't see it.
 */
export async function approveProposalAction(
  rawInput: unknown,
  rawExternalId: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const guard = await requireApprover();
  if (!guard.ok) return guard;

  if (
    typeof rawExternalId !== "string" ||
    !rawExternalId.startsWith(`${ENRICH_SOURCE}:`)
  ) {
    return { ok: false, error: "Missing the external id for this page." };
  }

  const parsed = resourceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map(
          (i) =>
            `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`,
        )
        .join("; "),
    };
  }

  const { id, created } = await upsertEnrichedResource({
    resource: parsed.data,
    externalId: rawExternalId,
    actorUid: guard.session.uid,
    flagReason:
      "Drafted by AI from the organization's own page, then edited by hand. Needs verifying.",
  });

  await logAudit({
    action: created ? "create" : "update",
    resourceType: "resource",
    resourceId: id,
    diff: { sourceName: { before: null, after: ENRICH_SOURCE } },
  });

  revalidatePath("/resources");
  revalidatePath(`/resources/${id}`);
  return { ok: true, id };
}
