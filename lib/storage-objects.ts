import "server-only";
import { randomUUID } from "node:crypto";
import { mediaBucket } from "@/lib/firebase/admin";
import { firebaseDownloadUrl } from "@/lib/storage-paths";

export type UploadedObject = {
  contentType: string;
  sizeBytes: number;
};

/**
 * What Storage itself says about an object the browser claims to have
 * uploaded — or null if it isn't there. Content type and size come from
 * here, never from the client.
 */
export async function statUploadedObject(
  path: string,
): Promise<UploadedObject | null> {
  const file = mediaBucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [metadata] = await file.getMetadata();
  return {
    contentType: metadata.contentType ?? "",
    sizeBytes: Number(metadata.size ?? 0),
  };
}

/**
 * A tokenized download URL for a media object, minting a token if the
 * upload didn't carry one.
 */
export async function mediaDownloadUrl(path: string): Promise<string> {
  const bucket = mediaBucket();
  const file = bucket.file(path);
  const [metadata] = await file.getMetadata();
  const existing = String(
    metadata.metadata?.firebaseStorageDownloadTokens ?? "",
  )
    .split(",")
    .find(Boolean);
  const token = existing ?? randomUUID();
  if (!existing) {
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
  }
  return firebaseDownloadUrl(bucket.name, path, token);
}

/**
 * Strip the download token Firebase attaches on upload. Veteran attachments
 * are only ever served through the session-checked API route; a token would
 * be a permanent, unauthenticated link to a DD-214.
 */
export async function revokeDownloadTokens(path: string): Promise<void> {
  await mediaBucket()
    .file(path)
    .setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
}
