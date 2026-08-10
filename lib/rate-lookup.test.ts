import { describe, expect, it } from "vitest";
import { monthlyForRating, monthlyLift, rateCodeFor } from "./rate-lookup";

describe("rateCodeFor", () => {
  it("builds the code from rating + dependency", () => {
    expect(rateCodeFor(70, "alone")).toBe("70-A");
    expect(rateCodeFor(70, "with_spouse")).toBe("70-S");
    expect(rateCodeFor(100, "with_spouse_kids")).toBe("100-SK");
  });

  it("returns null for a 0 rating", () => {
    expect(rateCodeFor(0, "alone")).toBeNull();
  });
});

describe("monthlyForRating", () => {
  const amounts = new Map<string, number>([
    ["70-A", 1759.19],
    ["70-S", 1908.43],
    ["100-SK", 4201.35],
  ]);

  it("resolves the monthly amount from the map", () => {
    expect(monthlyForRating(70, "alone", amounts)).toBe(1759.19);
    expect(monthlyForRating(100, "with_spouse_kids", amounts)).toBe(4201.35);
  });

  it("is 0 for a 0 rating", () => {
    expect(monthlyForRating(0, "with_spouse", amounts)).toBe(0);
  });

  it("is 0 when the code is missing from the map", () => {
    expect(monthlyForRating(50, "alone", amounts)).toBe(0);
  });
});

describe("monthlyLift", () => {
  it("is after minus before", () => {
    expect(monthlyLift(0, 1908.43)).toBe(1908.43);
  });

  it("never goes negative", () => {
    expect(monthlyLift(2000, 500)).toBe(0);
  });
});
