import { describe, expect, it } from "vitest";
import { describeRange, rangeQuery, resolveRange, todayIso } from "../range";

describe("resolveRange", () => {
  it("defaults to the current calendar year", () => {
    expect(resolveRange({}, "2026-10-13")).toEqual({ from: "2026-01-01", to: "2026-12-31", all: false });
  });

  it("honours all=1 and ignores malformed dates", () => {
    expect(resolveRange({ all: "1" }, "2026-10-13")).toEqual({ all: true });
    expect(resolveRange({ from: "2026-02-01", to: "nope" }, "2026-10-13")).toEqual({ from: "2026-02-01", to: undefined, all: false });
  });

  it("round-trips through rangeQuery", () => {
    expect(rangeQuery({})).toBe("all=1");
    expect(resolveRange(Object.fromEntries(new URLSearchParams(rangeQuery({ from: "2025-01-01", to: "2025-12-31" }))))).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });
});

describe("describeRange / todayIso", () => {
  it("names calendar years", () => {
    expect(describeRange({ from: "2025-01-01", to: "2025-12-31" })).toBe("Calendar year 2025");
    expect(describeRange({})).toBe("All time");
  });

  it("uses Eastern time for today", () => {
    expect(todayIso(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12-31");
  });
});
