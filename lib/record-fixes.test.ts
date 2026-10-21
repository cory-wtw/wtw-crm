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

describe("research corrections", () => {
  it("makes Chattanooga walk-in places local instead of Tennessee-only", () => {
    const [f] = planRecordFixes([
      aResource({ organizationName: "Chattanooga Free Store", geoScope: "state", geoStates: ["TN"] }),
    ]);
    expect(f.changes.geoScope.after).toBe("local");
    expect(f.changes.geoLocalities.after).toEqual(["Chattanooga"]);
  });

  it("corrects Bridge Health to adults too, once", () => {
    const bridge = aResource({
      organizationName: "Bridge Health (formerly Lookout Mountain Community Services)",
      eligibilityNotes: "Serves children and adolescents.",
      whatToBring: "Child's insurance card",
    });
    const [f] = planRecordFixes([bridge]);
    expect(String(f.changes.eligibilityNotes.after)).toMatch(/^Adults/);
    expect(
      planRecordFixes([{ ...bridge, eligibilityNotes: String(f.changes.eligibilityNotes.after), whatToBring: String(f.changes.whatToBring.after) }]),
    ).toEqual([]);
  });

  it("widens the Vet Center wording and keeps the rest of the description", () => {
    const [f] = planRecordFixes([
      aResource({
        organizationName: "Chattanooga Vet Center",
        description: "Counseling center. Serves combat veterans and MST survivors. Records kept separate.",
        eligibilityNotes: "Combat veterans and MST survivors. No VA enrollment needed.",
      }),
    ]);
    expect(f.changes.description.after).toBe(
      "Counseling center. Serves combat veterans, MST survivors, some other veterans, and their families. Records kept separate.",
    );
  });

  it("neutral wording builds on a correction instead of undoing it", () => {
    const [f] = planRecordFixes([
      aResource({
        organizationName: "Chattanooga Vet Center",
        description: "He can call. Serves combat veterans and MST survivors.",
      }),
    ]);
    expect(f.changes.description.after).toBe(
      "They can call. Serves combat veterans, MST survivors, some other veterans, and their families.",
    );
  });
});
