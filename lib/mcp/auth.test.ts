import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isValidMcpKey } = await import("./auth");

const KEY = "k".repeat(40);

describe("isValidMcpKey", () => {
  it("accepts the configured key only", () => {
    expect(isValidMcpKey(KEY, KEY)).toBe(true);
    expect(isValidMcpKey(`${KEY}x`, KEY)).toBe(false);
    expect(isValidMcpKey("", KEY)).toBe(false);
  });

  it("stays off when the key is unset or too short", () => {
    expect(isValidMcpKey("", undefined)).toBe(false);
    expect(isValidMcpKey("short", "short")).toBe(false);
  });
});
