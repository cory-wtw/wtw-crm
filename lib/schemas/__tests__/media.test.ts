import { describe, expect, it } from "vitest";
import {
  MEDIA_KINDS,
  MEDIA_MAX_BYTES,
  MEDIA_STATUSES,
  mediaEditInputSchema,
  mediaInputSchema,
  mediaKindFromContentType,
} from "..";

const VALID = {
  storagePath: "media/u1/1700000000-abc-photo.jpg",
  fileName: "photo.jpg",
  caption: "Ribbon cutting at the new HQ",
  tags: ["event", "2026"],
  linkedVeteranId: null,
  consentOnFile: true,
};

describe("mediaInputSchema", () => {
  it("accepts a valid upload", () => {
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

  it("drops client-claimed URL, type, size, and kind — the server reads those from Storage", () => {
    const result = mediaInputSchema.safeParse({
      ...VALID,
      kind: "video",
      downloadUrl: "https://evil.example/x.jpg",
      contentType: "image/jpeg",
      sizeBytes: MEDIA_MAX_BYTES + 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("downloadUrl");
      expect(result.data).not.toHaveProperty("contentType");
      expect(result.data).not.toHaveProperty("sizeBytes");
      expect(result.data).not.toHaveProperty("kind");
    }
  });

  it("defaults tags, consent, and veteran link when omitted", () => {
    const result = mediaInputSchema.safeParse({
      storagePath: "media/u1/clip.mp4",
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
});

describe("mediaEditInputSchema", () => {
  it("accepts the editable fields", () => {
    const result = mediaEditInputSchema.safeParse({
      caption: "Updated caption",
      tags: ["event"],
      linkedVeteranId: null,
      consentOnFile: true,
    });
    expect(result.success).toBe(true);
  });

  it("still requires a caption", () => {
    const result = mediaEditInputSchema.safeParse({
      caption: "",
      tags: [],
      consentOnFile: false,
    });
    expect(result.success).toBe(false);
  });

  it("defaults tags and veteran link", () => {
    const result = mediaEditInputSchema.safeParse({
      caption: "Just a caption",
      consentOnFile: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.linkedVeteranId).toBeNull();
    }
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
