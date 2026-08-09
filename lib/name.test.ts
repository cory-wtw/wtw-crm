import { describe, expect, it } from "vitest";
import { formatShortName, splitFullName } from "./name";

describe("splitFullName", () => {
  it("splits a simple first + last name", () => {
    expect(splitFullName("John Doe")).toEqual({
      firstName: "John",
      lastInitial: "D",
    });
  });

  it("upper-cases the last initial", () => {
    expect(splitFullName("john doe")).toEqual({
      firstName: "john",
      lastInitial: "D",
    });
  });

  it("uses the last token for the initial on multi-word names", () => {
    expect(splitFullName("Mary Jo Van Halen")).toEqual({
      firstName: "Mary",
      lastInitial: "H",
    });
  });

  it("handles a single-word name with no initial", () => {
    expect(splitFullName("Cher")).toEqual({
      firstName: "Cher",
      lastInitial: "",
    });
  });

  it("collapses extra whitespace", () => {
    expect(splitFullName("  John   Doe  ")).toEqual({
      firstName: "John",
      lastInitial: "D",
    });
  });

  it("returns empties for a blank string", () => {
    expect(splitFullName("")).toEqual({ firstName: "", lastInitial: "" });
    expect(splitFullName("   ")).toEqual({ firstName: "", lastInitial: "" });
  });
});

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
