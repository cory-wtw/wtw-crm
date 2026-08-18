import "server-only";
import type { WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
  VerificationCheckType,
  VerificationResult,
} from "@/lib/schemas";

const COLLECTION = "verifications";

export type VerificationEntry = {
  resourceId: string;
  checkType: VerificationCheckType;
  result: VerificationResult;
  detail: string;
  /** uid of the person, or "system" for an automated check. */
  checkedBy: string;
};

/**
 * Stage a verifications doc onto an existing batch.
 *
 * Deliberately batch-scoped rather than fire-and-forget like `logAudit`: a
 * resource must never sit in `flagged` without a doc saying who flagged it and
 * why, so the status change and its justification have to commit together or
 * not at all. Audit logging can afford to fail quietly; this can't.
 */
export function stageVerification(
  batch: WriteBatch,
  entry: VerificationEntry,
  at: Date = new Date(),
): void {
  const ref = adminDb.collection(COLLECTION).doc();
  batch.set(ref, {
    resourceId: entry.resourceId,
    checkType: entry.checkType,
    result: entry.result,
    detail: entry.detail,
    checkedAt: at,
    checkedBy: entry.checkedBy,
  });
}
