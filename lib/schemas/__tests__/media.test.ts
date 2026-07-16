import { describe, expect, it } from "vitest";
import {
  MEDIA_KINDS,
  MEDIA_MAX_BYTES,
  MEDIA_STATUSES,
  mediaInputSchema,
  mediaKindFromContentType,
} from "..";

const VALID = {
  kind: "image" as const,
  storagePath: "media/u1/1700000000-abc-photo.jpg",
  downloadUrl: "https://example.com/photo.jpg",
  contentType: "image/jpeg",
  sizeBytes: 2048,
  fileName: "photo.jpg",
  caption: "Ribbon cutting at the new HQ",
  tags: ["event", "2026"],
  linkedVeteranId: null,
  consentOnFile: true,
};

describe("mediaInputSchema", () => {
  it("accepts a valid image upload", () => {
    const result = mediaInputSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("requires a caption", () => {
    const result = mediaInputSchema.safeParse({ ...VALID, caption: "" });
    expect(result.success).toBe(false);
  });

  it("requires a storage path", () => {
    const result = mediaInputSchema.safeParse({ ...VALID, storagePath: "" });
    expect(result.success).toBe(false);
  });

  it("requires a valid download URL", () => {
    const result = mediaInputSchema.safeParse({
      ...VALID,
      downloadUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects files over the 500 MB cap", () => {
    const result = mediaInputSchema.safeParse({
      ...VALID,
      sizeBytes: MEDIA_MAX_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a file exactly at the cap", () => {
    const result = mediaInputSchema.safeParse({
      ...VALID,
      sizeBytes: MEDIA_MAX_BYTES,
    });
    expect(result.success).toBe(true);
  });

  it("defaults tags, consent, and veteran link when omitted", () => {
    const result = mediaInputSchema.safeParse({
      kind: "video",
      storagePath: "media/u1/clip.mp4",
      downloadUrl: "https://example.com/clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 10,
      fileName: "clip.mp4",
      caption: "Veteran thank-you clip",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.consentOnFile).toBe(false);
      expect(result.data.linkedVeteranId).toBeNull();
    }
  });

  it("rejects a negative size", () => {
    const result = mediaInputSchema.safeParse({ ...VALID, sizeBytes: -1 });
    expect(result.success).toBe(false);
  });
});

describe("mediaKindFromContentType", () => {
  it("maps image mime types to image", () => {
    expect(mediaKindFromContentType("image/png")).toBe("image");
    expect(mediaKindFromContentType("image/heic")).toBe("image");
  });
  it("maps video mime types to video", () => {
    expect(mediaKindFromContentType("video/mp4")).toBe("video");
    expect(mediaKindFromContentType("video/quicktime")).toBe("video");
  });
  it("returns null for anything else", () => {
    expect(mediaKindFromContentType("application/pdf")).toBeNull();
    expect(mediaKindFromContentType("text/plain")).toBeNull();
    expect(mediaKindFromContentType("")).toBeNull();
  });
});

describe("media enums", () => {
  it("has the expected kinds and statuses", () => {
    expect(MEDIA_KINDS).toEqual(["image", "video"]);
    expect(MEDIA_STATUSES).toEqual(["new", "used", "archived"]);
  });
});
