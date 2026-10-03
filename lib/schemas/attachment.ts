import { z } from "zod";

/**
 * Files attached to a veteran's record — discharge paperwork, VA letters,
 * ID scans, signed releases, etc. Same "browser uploads directly to Firebase
 * Storage, then records the metadata" pattern as media.ts, but scoped to one
 * veteran and open to any file type (not just image/video).
 */

/**
 * Cap on a single upload. Far below media's 500 MB — these are scanned
 * documents, not video. Enforced client-side, in Storage rules, and
 * re-checked in the create action.
 */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const attachmentSchema = z.object({
  id: z.string(),
  veteranId: z.string().min(1),
  /** Path within the Storage bucket, e.g. "attachments/{veteranId}/{ts}-{name}". */
  storagePath: z.string().min(1),
  /**
   * Legacy: records made before attachments were served only through the
   * session-checked API route carried a tokenized Storage URL. Never written
   * now, and scripts/revoke-attachment-tokens.ts clears the old ones.
   */
  downloadUrl: z.string().url().optional(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  /** The original filename, kept for reference even after a rename. */
  fileName: z.string().min(1),
  /** The display name staff gave this file — what shows up on the page. */
  name: z.string().min(1),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/**
 * What the client sends when recording a freshly uploaded file. Content
 * type and size are read from Storage itself, and lifecycle fields are
 * server-controlled, so neither is accepted here.
 */
export const attachmentInputSchema = attachmentSchema.pick({
  veteranId: true,
  storagePath: true,
  fileName: true,
  name: true,
});
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

/**
 * The only thing editable after upload is the display name. The file itself
 * is immutable — to change it, delete and re-upload.
 */
export const attachmentRenameInputSchema = attachmentSchema.pick({
  name: true,
});
export type AttachmentRenameInput = z.infer<
  typeof attachmentRenameInputSchema
>;
