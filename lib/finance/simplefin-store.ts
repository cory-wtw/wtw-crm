import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Where the SimpleFIN access URL lives: the SIMPLEFIN_ACCESS_URL env var if
 * set, otherwise a server-only Firestore doc written by "Connect Found".
 * Firestore rules deny all client access to `integrations`.
 */
const DOC = adminDb.collection("integrations").doc("simplefin");

export async function getSimplefinAccessUrl(): Promise<string | null> {
  if (process.env.SIMPLEFIN_ACCESS_URL) return process.env.SIMPLEFIN_ACCESS_URL;
  const snap = await DOC.get();
  const url = snap.get("accessUrl");
  return typeof url === "string" && url ? url : null;
}

export async function saveSimplefinAccessUrl(accessUrl: string, byUid: string): Promise<void> {
  await DOC.set({ accessUrl, connectedAt: new Date(), connectedBy: byUid });
}
