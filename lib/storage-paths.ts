/**
 * Where browser uploads are allowed to land, and how to check a path the
 * browser hands back. Pure, so it can be unit-tested.
 *
 * The browser uploads straight to Storage and then tells a Server Action the
 * path. That path is later downloaded and deleted with Admin credentials, so
 * it must be one the caller could have written: inside their own folder,
 * directly (no nesting, no traversal).
 */

export function attachmentPathPrefix(veteranId: string): string {
  return `attachments/${veteranId}/`;
}

export function mediaPathPrefix(uid: string): string {
  return `media/${uid}/`;
}

/** True when `path` is a single file name directly under `prefix`. */
export function isUploadPathUnder(path: string, prefix: string): boolean {
  // The owner segment comes from a doc id or uid; neither may contain "/".
  const owner = prefix.slice(0, -1).split("/").pop() ?? "";
  if (!owner || owner === "." || owner === "..") return false;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return (
    name.length > 0 &&
    name.length <= 400 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".."
  );
}

/**
 * The tokenized URL the Firebase client SDK's getDownloadURL would return.
 * Built server-side from the object's own metadata so a stored URL always
 * points at the stored file, never at whatever the browser claimed.
 */
export function firebaseDownloadUrl(
  bucket: string,
  path: string,
  token: string,
): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket,
  )}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}
