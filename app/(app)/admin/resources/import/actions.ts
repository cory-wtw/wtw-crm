"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { findByExternalId } from "@/lib/external-id";
import { getSession } from "@/lib/firebase/session";
import { canApproveImportedResource } from "@/lib/permissions";
import { parseSeedResource, type SeedResource } from "@/lib/resource-import";
import { resourceInputSchema } from "@/lib/schemas";

/**
 * The browser twin of scripts/seed-resources.ts.
 *
 * Same mapper, same validation, same externalId, same idempotency — from
 * lib/resource-import.ts, so a record loaded here and one loaded from a laptop
 * can't disagree about what the file said. The difference is only where the
 * person is standing: this one works from a phone on a bus.
 */

export type ImportOutcome = {
  organizationName: string;
  id: string;
  created: boolean;
};

export type ImportFailure = {
  organizationName: string;
  errors: string[];
};

export type ImportSummary = {
  written: ImportOutcome[];
  failed: ImportFailure[];
};

async function requireApprover() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (!canApproveImportedResource(session)) {
    return { ok: false as const, error: "Admins only." };
  }
  return { ok: true as const, session };
}

/**
 * Load curated records.
 *
 * Every record is mapped and validated again here rather than trusting what
 * the preview said: the browser holds a draft, and a draft is not an
 * authorization. One bad record fails alone — the rest still land, because
 * losing four good organizations to a typo in the fifth would mean editing
 * JSON on a touchscreen to recover.
 */
export async function importResourcesAction(
  rawRecords: unknown,
): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const guard = await requireApprover();
  if (!guard.ok) return guard;

  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return { ok: false, error: "Nothing to load." };
  }
  if (rawRecords.length > 100) {
    return { ok: false, error: "Load 100 at a time or fewer." };
  }

  const written: ImportOutcome[] = [];
  const failed: ImportFailure[] = [];
  const now = new Date();

  for (const raw of rawRecords as SeedResource[]) {
    const name = raw?.org_name?.trim() || "(unnamed)";

    const mapped = parseSeedResource(raw ?? {});
    if (!mapped.ok) {
      failed.push({ organizationName: name, errors: mapped.errors });
      continue;
    }

    // Through the same schema the form validates against. A record the form
    // would reject must not get in by the back door.
    const validated = resourceInputSchema.safeParse(mapped.input);
    if (!validated.success) {
      failed.push({
        organizationName: name,
        errors: validated.error.issues.map(
          (issue) =>
            `${issue.path.map(String).join(".") || "record"}: ${issue.message}`,
        ),
      });
      continue;
    }

    const existingId = await findByExternalId(mapped.externalId);
    const shared = {
      ...validated.data,
      externalId: mapped.externalId,
      updatedBy: guard.session.uid,
      updatedAt: now,
      // A record marked live was checked by the person loading it, today.
      // Recording that is what keeps it out of the aging bucket for the next
      // 90 days, and what makes the date on screen true.
      ...(validated.data.verificationStatus === "live"
        ? { lastVerified: now, lastVerifiedBy: guard.session.uid }
        : {}),
    };

    if (existingId) {
      await adminDb.collection("resources").doc(existingId).update(shared);
      written.push({ organizationName: name, id: existingId, created: false });
      await logAudit({
        action: "update",
        resourceType: "resource",
        resourceId: existingId,
        diff: { externalId: { before: null, after: mapped.externalId } },
      });
    } else {
      const ref = await adminDb.collection("resources").add({
        ...shared,
        ...(validated.data.verificationStatus === "live"
          ? {}
          : { lastVerified: null, lastVerifiedBy: null }),
        createdBy: guard.session.uid,
        createdAt: now,
      });
      written.push({ organizationName: name, id: ref.id, created: true });
      await logAudit({
        action: "create",
        resourceType: "resource",
        resourceId: ref.id,
        diff: { externalId: { before: null, after: mapped.externalId } },
      });
    }
  }

  revalidatePath("/resources");
  return { ok: true, summary: { written, failed } };
}
