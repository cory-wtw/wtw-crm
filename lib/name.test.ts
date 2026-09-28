import { describe, expect, it } from "vitest";
import { formatShortName } from "./name";

describe("formatShortName", () => {
  it("formats first name + initial", () => {
    expect(formatShortName("John", "D")).toBe("John D.");
  });

  it("omits the initial when missing", () => {
    expect(formatShortName("Cher", "")).toBe("Cher");
    expect(formatShortName("Cher", null)).toBe("Cher");
  });

  it("upper-cases a lower-case initial", () => {
    expect(formatShortName("John", "d")).toBe("John D.");
  });

  it("returns an empty string when there's no first name", () => {
    expect(formatShortName("", "")).toBe("");
  });
});
