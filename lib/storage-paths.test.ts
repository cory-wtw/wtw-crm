import { describe, expect, it } from "vitest";
import {
  attachmentPathPrefix,
  firebaseDownloadUrl,
  isUploadPathUnder,
  mediaPathPrefix,
} from "./storage-paths";

describe("isUploadPathUnder", () => {
  const vet = attachmentPathPrefix("vet123");

  it("accepts a file directly in the folder", () => {
    expect(isUploadPathUnder("attachments/vet123/1-abc-dd214.pdf", vet)).toBe(
      true,
    );
  });

  it("rejects another veteran's folder", () => {
    expect(isUploadPathUnder("attachments/vet999/1-dd214.pdf", vet)).toBe(
      false,
    );
  });

  it("rejects a prefix that only shares the start of the id", () => {
    expect(isUploadPathUnder("attachments/vet1234/x.pdf", vet)).toBe(false);
  });

  it("rejects nesting and traversal", () => {
    expect(isUploadPathUnder("attachments/vet123/a/b.pdf", vet)).toBe(false);
    expect(isUploadPathUnder("attachments/vet123/..", vet)).toBe(false);
    expect(isUploadPathUnder("attachments/vet123/", vet)).toBe(false);
  });

  it("rejects a media path recorded as an attachment and vice versa", () => {
    expect(isUploadPathUnder("media/vet123/x.jpg", vet)).toBe(false);
    expect(
      isUploadPathUnder("attachments/u1/x.pdf", mediaPathPrefix("u1")),
    ).toBe(false);
  });

  it("rejects an owner id that could escape its folder", () => {
    expect(isUploadPathUnder("attachments/../x", attachmentPathPrefix(".."))).toBe(
      false,
    );
    expect(isUploadPathUnder("attachments//x", attachmentPathPrefix(""))).toBe(
      false,
    );
  });
});

describe("firebaseDownloadUrl", () => {
  it("encodes the path as one segment", () => {
    expect(firebaseDownloadUrl("b.app", "media/u1/a b.jpg", "tok")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/b.app/o/media%2Fu1%2Fa%20b.jpg?alt=media&token=tok",
    );
  });
});
