import { describe, expect, it } from "vitest";
import { formatDate, formatDateOnly, formatUsd } from "./format";

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
    const d = new Date("2026-05-15T12:00:00Z"); // May 15, 2026
    expect(formatDate(d)).toBe("May 15, 2026");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2026-05-15T12:00:00Z")).toBe("May 15, 2026");
  });

  it("uses Eastern time regardless of the process time zone", () => {
    // 02:00 UTC on Nov 3 is 9pm on Nov 2 in Chattanooga. The server (UTC)
    // and the browser must agree on this, or hydration fails.
    expect(formatDate("2026-11-03T02:00:00Z")).toBe("Nov 2, 2026");
    expect(formatDate("2026-11-03T05:00:00Z")).toBe("Nov 3, 2026");
  });

  it("returns em-dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for invalid strings", () => {
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("formatDateOnly", () => {
  it("keeps the calendar day of a date-only value regardless of the process time zone", () => {
    expect(formatDateOnly("2026-05-15")).toBe("May 15, 2026");
    expect(formatDateOnly(new Date("2026-05-15"))).toBe("May 15, 2026");
    // The connector widens YYYY-MM-DD to noon UTC.
    expect(formatDateOnly("2026-05-15T12:00:00Z")).toBe("May 15, 2026");
  });

  it("returns em-dash for null/undefined/invalid", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
    expect(formatDateOnly("not a date")).toBe("—");
  });
});
