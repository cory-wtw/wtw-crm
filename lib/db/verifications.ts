import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Verification } from "@/lib/schemas";

const COLLECTION = "verifications";

function tsToDate(value: unknown): Date | null {
  const asTimestamp = value as { toDate?: () => Date } | null | undefined;
  if (asTimestamp?.toDate) return asTimestamp.toDate();
  if (value instanceof Date) return value;
  return null;
}

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Verification {
  return {
    id,
    resourceId: data.resourceId ?? "",
    checkType: data.checkType ?? "manual",
    result: data.result ?? "pass",
    detail: data.detail ?? "",
    checkedAt: tsToDate(data.checkedAt) ?? new Date(0),
    checkedBy: data.checkedBy ?? "system",
  };
}

/**
 * Every check ever run against one resource, newest first.
 *
 * Sorted in memory rather than with `.orderBy("checkedAt")`, because pairing
 * that with the `resourceId` equality filter needs a composite index and this
 * repo has no index file or deploy step for one. A single resource accumulates
 * a handful of checks, so the sort is free — revisit if Phase 7's batch runner
 * ever makes these rows deep, at which point the index is worth the deploy.
 */
export async function listVerificationsForResource(
  resourceId: string,
): Promise<Verification[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where("resourceId", "==", resourceId)
    .get();
  return snap.docs
    .map((d) => deserialize(d.id, d.data()))
    .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
}

/** The most recent check against a resource, or null if it's never been checked. */
export async function getLatestVerification(
  resourceId: string,
): Promise<Verification | null> {
  const all = await listVerificationsForResource(resourceId);
  return all[0] ?? null;
}
