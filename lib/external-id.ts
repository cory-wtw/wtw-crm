/**
 * Look a resource up by the id its source knows it as.
 *
 * Its own module, and that is the whole point. Every importer needs this one
 * query to stay idempotent, and it used to live in lib/enrich-runner.ts — which
 * also imports the Anthropic SDK. Anything reaching for the lookup dragged an
 * AI client into its bundle, including routes that have nothing to do with AI
 * and run on servers with no API key configured.
 *
 * No `server-only` marker: the import scripts in scripts/ use this outside
 * Next, the same reason lib/firebase/admin.ts has none.
 */

import { adminDb } from "@/lib/firebase/admin";

export async function findByExternalId(
  externalId: string,
): Promise<string | null> {
  const snap = await adminDb
    .collection("resources")
    .where("externalId", "==", externalId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}
