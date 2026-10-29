import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashSecret, isAllowedRedirectUri, newSecret, verifyPkce } from "./oauth-core";

describe("isAllowedRedirectUri", () => {
  it("allows Claude's callbacks and local ports", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:5000/cb")).toBe(true);
  });

  it("refuses everything else", () => {
    expect(isAllowedRedirectUri("https://claude.ai/some/other/page")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai.evil.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("http://claude.ai/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://localhost/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://evil.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback#x")).toBe(false);
    expect(isAllowedRedirectUri(`http://localhost/${"a".repeat(600)}`)).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
});

describe("verifyPkce", () => {
  const verifier = "a".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("accepts the matching verifier only", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("b".repeat(43), challenge)).toBe(false);
  });

  it("refuses a too-short verifier", () => {
    expect(verifyPkce("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
  });
});

describe("secrets", () => {
  it("are random and stored hashed", () => {
    const a = newSecret();
    expect(a).not.toBe(newSecret());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSecret(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(a)).not.toContain(a);
  });
});
