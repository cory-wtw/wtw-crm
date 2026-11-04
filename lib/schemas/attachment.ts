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

/**
 * Every upload picks one of these. There is deliberately no medical
 * category: the Roster never stores diagnoses, treatment letters, or claim
 * files (see lib/medical-terms.ts).
 */
export const ATTACHMENT_CATEGORIES = [
  "dd214",
  "gov_id",
  "vso_form",
  "referral_packet",
  "other",
] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  dd214: "DD214 / Discharge paperwork",
  gov_id: "Government ID",
  vso_form: "VSO form / authorization",
  referral_packet: "Referral packet",
  other: "Other (non-medical)",
};

/** Label for the list chip; files uploaded before categories existed. */
export const ATTACHMENT_UNCATEGORIZED_LABEL = "Uncategorized";

export function attachmentCategoryLabel(
  category: AttachmentCategory | null | undefined,
): string {
  return category
    ? ATTACHMENT_CATEGORY_LABELS[category]
    : ATTACHMENT_UNCATEGORIZED_LABEL;
}

export const attachmentSchema = z.object({
  id: z.string(),
  veteranId: z.string().min(1),
  /** Path within the Storage bucket, e.g. "attachments/{veteranId}/{ts}-{name}". */
  storagePath: z.string().min(1),
  /** Tokenized download URL used to view/download the file. */
  downloadUrl: z.string().url(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  /** The original filename, kept for reference even after a rename. */
  fileName: z.string().min(1),
  /** The name of the file the user picked, before PDF conversion. Null on older records. */
  originalFileName: z.string().nullable(),
  /** The display name staff gave this file — what shows up on the page. */
  name: z.string().min(1),
  /**
   * Required on new uploads. Null on records created before categories
   * existed; those display as "Uncategorized".
   */
  category: z.enum(ATTACHMENT_CATEGORIES).nullable(),
  /**
   * Set when the file name looked medical and the uploader confirmed it is
   * not a medical record. The uid of whoever ticked the box, else null.
   */
  nonMedicalConfirmedBy: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/**
 * What the client sends when recording a freshly uploaded file. Lifecycle
 * fields are server-controlled and omitted here.
 */
export const attachmentInputSchema = attachmentSchema
  .pick({
    veteranId: true,
    storagePath: true,
    downloadUrl: true,
    contentType: true,
    sizeBytes: true,
    fileName: true,
    name: true,
  })
  .extend({
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(ATTACHMENT_MAX_BYTES, "File is larger than the 25 MB limit"),
    category: z.enum(ATTACHMENT_CATEGORIES, {
      message: "Pick a category",
    }),
    originalFileName: z.string().optional(),
    /** "I confirm this is not a medical record" — only needed when a name matched a medical term. */
    nonMedicalConfirmed: z.boolean().optional(),
  });
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

/**
 * The only thing editable after upload is the display name. The file itself
 * is immutable — to change it, delete and re-upload.
 */
export const attachmentRenameInputSchema = attachmentSchema
  .pick({
    name: true,
  })
  .extend({
    /** "I confirm this is not a medical record" — only needed when the new name matched a medical term. */
    nonMedicalConfirmed: z.boolean().optional(),
  });
export type AttachmentRenameInput = z.infer<
  typeof attachmentRenameInputSchema
>;
