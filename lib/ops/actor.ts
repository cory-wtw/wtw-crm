import type { WriteBatch } from "firebase-admin/firestore";

/** Who a write is attributed to: the signed-in person, or the admin who
 *  approved a Claude change request. A Session satisfies this. */
export type Actor = { uid: string; email: string };

/**
 * Lets a caller add its own writes to an op's batch, so they commit together
 * or not at all. Approving a Claude change request uses it to mark the request
 * approved in the same commit as the change itself — a retry can then never
 * apply it twice. `id` is the doc the op created, when it created one.
 */
export type OnCommit = (
  batch: WriteBatch,
  applied: { id: string | null; result?: Record<string, unknown> },
) => void;
