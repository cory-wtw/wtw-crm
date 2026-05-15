import { describe, expect, it } from "vitest";
import { formatDate, formatUsd } from "./format";

describe("formatUsd", () => {
  it("formats whole dollars without decimals", () => {
    expect(formatUsd(1234)).toBe("$1,234");
  });

  it("rounds fractional cents", () => {
    expect(formatUsd(4928.81)).toBe("$4,929");
  });

  it("handles zero", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  it("handles large lifetime amounts", () => {
    expect(formatUsd(2957286)).toBe("$2,957,286");
  });

  it("returns em-dash for null/undefined/NaN", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date(2026, 4, 15); // May 15, 2026
    expect(formatDate(d)).toBe("May 15, 2026");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2026-05-15T12:00:00Z")).toMatch(/May 15, 2026/);
  });

  it("returns em-dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for invalid strings", () => {
    expect(formatDate("not a date")).toBe("—");
  });
});
