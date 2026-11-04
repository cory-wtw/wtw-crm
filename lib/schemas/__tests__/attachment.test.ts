import { describe, expect, it } from "vitest";
import { attachmentCategoryLabel, attachmentInputSchema } from "..";

const VALID = {
  veteranId: "v1",
  storagePath: "attachments/v1/1700000000-abc-dd214.pdf",
  downloadUrl: "https://example.com/dd214.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  fileName: "dd214.pdf",
  name: "DD-214",
  category: "dd214" as const,
};

describe("attachmentInputSchema", () => {
  it("accepts a valid upload with a category", () => {
    expect(attachmentInputSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a category", () => {
    expect(
      attachmentInputSchema.safeParse({ ...VALID, category: undefined })
        .success,
    ).toBe(false);
    expect(
      attachmentInputSchema.safeParse({ ...VALID, category: "medical" })
        .success,
    ).toBe(false);
  });

  it("accepts the optional non-medical confirmation", () => {
    const result = attachmentInputSchema.safeParse({
      ...VALID,
      originalFileName: "claim-form-cover.jpg",
      nonMedicalConfirmed: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("attachmentCategoryLabel", () => {
  it("shows Uncategorized for records without a category", () => {
    expect(attachmentCategoryLabel(null)).toBe("Uncategorized");
    expect(attachmentCategoryLabel(undefined)).toBe("Uncategorized");
    expect(attachmentCategoryLabel("gov_id")).toBe("Government ID");
  });
});
