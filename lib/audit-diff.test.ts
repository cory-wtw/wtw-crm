import { describe, expect, it } from "vitest";
import { computeDiff } from "./audit-diff";

describe("computeDiff", () => {
  it("returns empty when nothing changed", () => {
    const result = computeDiff(
      { name: "Cory", role: "admin" },
      { name: "Cory", role: "admin" },
      ["name", "role"],
    );
    expect(result).toEqual({});
  });

  it("captures string changes", () => {
    const result = computeDiff(
      { name: "Cory" },
      { name: "Cory Gold" },
      ["name"],
    );
    expect(result).toEqual({
      name: { before: "Cory", after: "Cory Gold" },
    });
  });

  it("ignores fields not in the tracked list", () => {
    const result = computeDiff(
      { name: "Cory", secret: "old" },
      { name: "Cory Gold", secret: "new" },
      ["name"],
    );
    expect(Object.keys(result)).toEqual(["name"]);
  });

  it("treats undefined and null as equal", () => {
    const result = computeDiff(
      { phone: null },
      { phone: undefined },
      ["phone"],
    );
    expect(result).toEqual({});
  });

  it("treats a value going from undefined to a real value as a change", () => {
    const result = computeDiff(
      { phone: undefined },
      { phone: "555-1234" },
      ["phone"],
    );
    expect(result).toEqual({
      phone: { before: null, after: "555-1234" },
    });
  });

  it("compares arrays by content, not reference", () => {
    const result = computeDiff(
      { vsoIds: ["a", "b"] },
      { vsoIds: ["a", "b"] },
      ["vsoIds"],
    );
    expect(result).toEqual({});
  });

  it("detects array changes", () => {
    const result = computeDiff(
      { vsoIds: ["a"] },
      { vsoIds: ["a", "b"] },
      ["vsoIds"],
    );
    expect(result).toEqual({
      vsoIds: { before: ["a"], after: ["a", "b"] },
    });
  });

  it("compares plain objects by content", () => {
    const result = computeDiff(
      { meta: { foo: 1 } },
      { meta: { foo: 1 } },
      ["meta"],
    );
    expect(result).toEqual({});
  });

  it("captures numeric and boolean changes", () => {
    const result = computeDiff(
      { yearlyIncome: 100, active: true },
      { yearlyIncome: 200, active: false },
      ["yearlyIncome", "active"],
    );
    expect(result).toEqual({
      yearlyIncome: { before: 100, after: 200 },
      active: { before: true, after: false },
    });
  });
});
