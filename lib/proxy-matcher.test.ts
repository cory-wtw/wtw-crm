import { describe, expect, it } from "vitest";
import { shouldProcessByProxy } from "./proxy-matcher";

describe("shouldProcessByProxy", () => {
  it("processes app routes", () => {
    expect(shouldProcessByProxy("/")).toBe(true);
    expect(shouldProcessByProxy("/login")).toBe(true);
    expect(shouldProcessByProxy("/veterans")).toBe(true);
    expect(shouldProcessByProxy("/veterans/abc123")).toBe(true);
    expect(shouldProcessByProxy("/veterans/abc123/edit")).toBe(true);
    expect(shouldProcessByProxy("/vsos")).toBe(true);
    expect(shouldProcessByProxy("/admin")).toBe(true);
  });

  it("skips Next.js internals", () => {
    expect(shouldProcessByProxy("/_next/static/chunks/foo.js")).toBe(false);
    expect(shouldProcessByProxy("/_next/image?url=x.png")).toBe(false);
    expect(shouldProcessByProxy("/_next/data/bar")).toBe(false);
  });

  it("skips favicon", () => {
    expect(shouldProcessByProxy("/favicon.ico")).toBe(false);
  });

  it("skips static image assets", () => {
    expect(shouldProcessByProxy("/wtw-logo.png")).toBe(false);
    expect(shouldProcessByProxy("/icon.svg")).toBe(false);
    expect(shouldProcessByProxy("/photo.jpg")).toBe(false);
    expect(shouldProcessByProxy("/photo.jpeg")).toBe(false);
    expect(shouldProcessByProxy("/sprite.gif")).toBe(false);
    expect(shouldProcessByProxy("/banner.webp")).toBe(false);
    expect(shouldProcessByProxy("/legacy.ico")).toBe(false);
  });

  it("still processes routes whose names happen to contain image extension words", () => {
    // e.g. "/veterans/png" should be a normal app route, not an asset
    expect(shouldProcessByProxy("/veterans/png")).toBe(true);
    expect(shouldProcessByProxy("/admin/svg")).toBe(true);
  });

  it("processes nested static-looking paths only when they end in a known extension", () => {
    expect(shouldProcessByProxy("/photos/profile.png")).toBe(false);
    expect(shouldProcessByProxy("/photos/profile")).toBe(true);
  });
});
