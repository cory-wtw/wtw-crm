import { describe, expect, it } from "vitest";
import { planRecordFixes } from "./record-fixes";
import { aResource } from "./matching/__tests__/fixtures";

describe("planRecordFixes", () => {
  it("ticks the groups MST, SSVF and HUD-VASH programs only serve", () => {
    const fixes = planRecordFixes([
      aResource({ id: "a", organizationName: "DoD Safe Helpline" }),
      aResource({ id: "b", organizationName: "Volunteer Behavioral Health Care System (SSVF)" }),
      aResource({ id: "c", organizationName: "HUD-VASH (Chattanooga)" }),
    ]);
    const by = Object.fromEntries(fixes.map((f) => [f.id, f.changes.populationRestriction?.after]));
    expect(by).toEqual({ a: ["mst"], b: ["homeless", "housing-risk"], c: ["homeless"] });
  });

  it("leaves a record alone once it's already right", () => {
    expect(
      planRecordFixes([aResource({ organizationName: "Beyond MST", populationRestriction: ["mst"] })]),
    ).toEqual([]);
  });

  it("retires the lender listing", () => {
    const [f] = planRecordFixes([aResource({ organizationName: "Richard Sailors VA Home Loans" })]);
    expect(f.changes.verificationStatus.after).toBe("retired");
  });

  it("retires the weaker copy of a duplicate and keeps the verified one", () => {
    const fixes = planRecordFixes([
      aResource({ id: "keep", organizationName: "Chattanooga Area Food Bank", website: "chattfoodbank.org" }),
      aResource({
        id: "dup",
        organizationName: "Chattanooga Area Food Bank",
        lastVerified: null,
        verificationStatus: "flagged",
      }),
    ]);
    expect(fixes.map((f) => f.id)).toEqual(["dup"]);
  });

  it("rewrites he/him in record text", () => {
    const [f] = planRecordFixes([aResource({ whatToBring: "His DD-214" })]);
    expect(f.changes.whatToBring).toEqual({ before: "His DD-214", after: "Their DD-214" });
  });
});

it("retires a realtor listing", () => {
  const [f] = planRecordFixes([aResource({ organizationName: "Jeff Morrow Keller Williams" })]);
  expect(f.changes.verificationStatus.after).toBe("retired");
});
