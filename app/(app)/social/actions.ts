"use server";

import { revalidatePath } from "next/cache";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { getMedia } from "@/lib/db/media";
import {
  canDeleteMedia,
  canEditMedia,
  canMarkMediaUsed,
  canViewVeteran,
} from "@/lib/permissions";
import { getSession } from "@/lib/firebase/session";
import {
  MEDIA_MAX_BYTES,
  mediaEditInputSchema,
  mediaInputSchema,
  mediaKindFromContentType,
} from "@/lib/schemas";
import { mediaDownloadUrl, statUploadedObject } from "@/lib/storage-objects";
import { isUploadPathUnder, mediaPathPrefix } from "@/lib/storage-paths";

function dropUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

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
 * Record a file that the client already uploaded to Firebase Storage. The
 * bytes never pass through the server — the browser uploads directly to
 * Storage (see upload-form.tsx) and hands us back the path.
 *
 * The path is later deleted with Admin credentials, so it must be inside the
 * caller's own media folder. Everything else about the file — kind, type,
 * size, URL — is read from Storage, not taken from the browser.
 */
export async function createMediaAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = mediaInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  if (!isUploadPathUnder(input.storagePath, mediaPathPrefix(session.uid))) {
    return { ok: false, error: "That upload isn't in your media folder." };
  }
  const stored = await statUploadedObject(input.storagePath);
  if (!stored) {
    return { ok: false, error: "The upload didn't finish. Try again." };
  }
  const kind = mediaKindFromContentType(stored.contentType);
  if (!kind) {
    return { ok: false, error: "Only photos and videos are allowed." };
  }
  if (stored.sizeBytes > MEDIA_MAX_BYTES) {
    return { ok: false, error: "File is larger than the 500 MB limit." };
  }

  const now = new Date();
  const doc = dropUndefined({
    ...input,
    kind,
    contentType: stored.contentType,
    sizeBytes: stored.sizeBytes,
    downloadUrl: await mediaDownloadUrl(input.storagePath),
    tags: input.tags ?? [],
    // Social-only users never see veterans, so they can't link one.
    linkedVeteranId: canViewVeteran(session)
      ? (input.linkedVeteranId ?? null)
      : null,
    status: "new" as const,
    usedAt: null,
    usedBy: null,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("media").add(doc);
  await logAudit({
    action: "create",
    resourceType: "media",
    resourceId: ref.id,
  });

  revalidatePath("/social");
  return { ok: true, id: ref.id };
}

/**
 * Edit an item's details (caption, tags, consent, veteran link). The file
 * itself is immutable. A social-only editor never sees veteran names, so we
 * preserve any existing linkedVeteranId rather than let the edit clear it.
 */
export async function editMediaAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const media = await getMedia(id);
  if (!media) return { ok: false, error: "Media not found." };
  if (!canEditMedia(session, media)) {
    return { ok: false, error: "Only the uploader or an admin can edit this." };
  }

  const parsed = mediaEditInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;

  // Only a user allowed to see veterans may change the link; otherwise keep
  // whatever's already there.
  const linkedVeteranId = canViewVeteran(session)
    ? input.linkedVeteranId ?? null
    : media.linkedVeteranId;

  const updates = {
    caption: input.caption,
    tags: input.tags ?? [],
    consentOnFile: input.consentOnFile,
    linkedVeteranId,
    updatedBy: session.uid,
    updatedAt: new Date(),
  };

  const diff = computeDiff(
    {
      caption: media.caption,
      tags: media.tags,
      consentOnFile: media.consentOnFile,
      linkedVeteranId: media.linkedVeteranId,
    },
    { caption: updates.caption, tags: updates.tags, consentOnFile: updates.consentOnFile, linkedVeteranId },
    ["caption", "tags", "consentOnFile", "linkedVeteranId"],
  );

  await adminDb.collection("media").doc(id).update(updates);
  await logAudit({
    action: "update",
    resourceType: "media",
    resourceId: id,
    diff,
  });

  revalidatePath("/social");
  return { ok: true, id };
}

/**
 * Flip a media item between "new" and "used". Marking it used stamps usedAt /
 * usedBy so the gallery can show when (and who) posted it. Items are removed
 * manually via deleteMediaAction — there's no auto-deletion.
 */
export async function setMediaUsedAction(
  id: string,
  used: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canMarkMediaUsed(session)) {
    return { ok: false, error: "Not allowed." };
  }

  const ref = adminDb.collection("media").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Media not found." };

  const now = new Date();
  await ref.update({
    status: used ? "used" : "new",
    usedAt: used ? now : null,
    usedBy: used ? session.uid : null,
    updatedBy: session.uid,
    updatedAt: now,
  });

  await logAudit({
    action: "update",
    resourceType: "media",
    resourceId: id,
    diff: { status: { before: snap.data()?.status ?? "new", after: used ? "used" : "new" } },
  });

  revalidatePath("/social");
  return { ok: true };
}

/** Delete a media item: removes the Storage file first, then the doc. */
export async function deleteMediaAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const media = await getMedia(id);
  if (!media) return { ok: false, error: "Media not found." };
  if (!canDeleteMedia(session, media)) {
    return { ok: false, error: "Only the uploader or an admin can delete this." };
  }

  // Best-effort Storage cleanup — a missing object shouldn't block removing
  // the record.
  // Only ever inside the uploader's own folder, whatever an older record
  // claims — a media record must not be able to delete a veteran's file.
  try {
    if (isUploadPathUnder(media.storagePath, mediaPathPrefix(media.createdBy))) {
      await mediaBucket()
        .file(media.storagePath)
        .delete({ ignoreNotFound: true });
    } else {
      console.error("media path outside its folder", id);
    }
  } catch (err) {
    console.error("media storage delete failed", err);
  }

  await adminDb.collection("media").doc(id).delete();
  await logAudit({
    action: "delete",
    resourceType: "media",
    resourceId: id,
  });

  revalidatePath("/social");
  return { ok: true };
}
