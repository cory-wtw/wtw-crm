import { z } from "zod";

/**
 * Social media wall. Staff drop photos and short videos (plus a caption)
 * here so the social media manager has a single, searchable place to pull
 * from instead of a shared Google Drive folder. Files live in Firebase
 * Storage; this doc holds the metadata + lifecycle.
 *
 * Lifecycle: new -> used -> (auto-purged 30 days after being marked used).
 * See lib/media-purge.ts for the retention math and the cron endpoint at
 * app/api/cron/purge-media that runs it.
 */

export const MEDIA_KINDS = ["image", "video"] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  image: "Photo",
  video: "Video",
};

export const MEDIA_STATUSES = ["new", "used", "archived"] as const;
export const mediaStatusSchema = z.enum(MEDIA_STATUSES);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  new: "New",
  used: "Used",
  archived: "Archived",
};

/**
 * Hard cap on a single upload. 500 MB comfortably covers a few minutes of
 * default (1080p/30) iPhone footage; longer clips should be trimmed or
 * shared as a link in the caption. Enforced client-side, in Storage rules,
 * and re-checked in the create action.
 */
export const MEDIA_MAX_BYTES = 500 * 1024 * 1024;

export const mediaSchema = z.object({
  id: z.string(),
  kind: mediaKindSchema,
  /** Path within the Storage bucket, e.g. "media/{uid}/{ts}-{name}". */
  storagePath: z.string().min(1),
  /** Tokenized download URL used to render the thumbnail/preview. */
  downloadUrl: z.string().url(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  fileName: z.string().min(1),
  /** The description the uploader writes for this photo/video. */
  caption: z.string().min(1, "Add a short description"),
  tags: z.array(z.string()).default([]),
  /** Optional link back to the veteran the media relates to. */
  linkedVeteranId: z.string().nullable().default(null),
  /**
   * Whether a signed photo/media release is on file for the people shown.
   * The manager should only publish media with consent on file.
   */
  consentOnFile: z.boolean().default(false),
  status: mediaStatusSchema.default("new"),
  /** Set when status flips to "used"; starts the 30-day purge clock. */
  usedAt: z.date().nullable().default(null),
  usedBy: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Media = z.infer<typeof mediaSchema>;

/**
 * What the client sends when recording a freshly uploaded file. Status and
 * lifecycle fields are server-controlled and omitted here.
 */
export const mediaInputSchema = mediaSchema
  .pick({
    kind: true,
    storagePath: true,
    downloadUrl: true,
    contentType: true,
    sizeBytes: true,
    fileName: true,
    caption: true,
    tags: true,
    linkedVeteranId: true,
    consentOnFile: true,
  })
  .extend({
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(MEDIA_MAX_BYTES, "File is larger than the 500 MB limit"),
  });
export type MediaInput = z.infer<typeof mediaInputSchema>;

/** Map a MIME type to our coarse kind, or null if it's neither. */
export function mediaKindFromContentType(
  contentType: string,
): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}
