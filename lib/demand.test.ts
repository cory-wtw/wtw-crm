import { describe, expect, it } from "vitest";
import { bucketOutcome, summarizeDemand, type IntakeRun } from "./demand";

function aRun(overrides: Partial<IntakeRun> = {}): IntakeRun {
  return {
    bucketsIdentified: ["housing"],
    bucketsMatched: ["housing"],
    candidatesFound: 3,
    ...overrides,
  };
}

describe("bucketOutcome", () => {
  it("calls a bucket met when something matched it", () => {
    expect(bucketOutcome(aRun(), "housing")).toBe("met");
  });

  it("calls it unmet when the run matched others but not this one", () => {
    const run = aRun({
      bucketsIdentified: ["housing", "legal"],
      bucketsMatched: ["housing"],
    });
    expect(bucketOutcome(run, "legal")).toBe("unmet");
  });

  it("calls everything unmet when the whole run matched nobody", () => {
    // True whatever else was recorded — this is the case the page exists for.
    const run = aRun({
      bucketsIdentified: ["housing", "legal"],
      bucketsMatched: null,
      candidatesFound: 0,
    });
    expect(bucketOutcome(run, "housing")).toBe("unmet");
    expect(bucketOutcome(run, "legal")).toBe("unmet");
  });

  it("admits it doesn't know on a run from before matches were recorded", () => {
    // Counting this as a gap would send staff chasing organizations for a need
    // that may already be served. Unknown stays unknown.
    const run = aRun({ bucketsMatched: null, candidatesFound: 4 });
    expect(bucketOutcome(run, "housing")).toBe("unknown");
  });
});

describe("summarizeDemand", () => {
  it("ranks the need asked for most with nothing to offer first", () => {
    const summary = summarizeDemand([
      aRun({ bucketsIdentified: ["housing"], bucketsMatched: [], candidatesFound: 0 }),
      aRun({ bucketsIdentified: ["housing"], bucketsMatched: [], candidatesFound: 0 }),
      aRun({ bucketsIdentified: ["legal"], bucketsMatched: [], candidatesFound: 0 }),
      aRun({ bucketsIdentified: ["health"], bucketsMatched: ["health"] }),
    ]);

    expect(summary.demand.map((row) => row.bucket)).toEqual([
      "housing",
      "legal",
      "health",
    ]);
    expect(summary.demand[0]).toEqual({
      bucket: "housing",
      asked: 2,
      unmet: 2,
      unknown: 0,
    });
  });

  it("puts a served need last however often it was asked for", () => {
    const summary = summarizeDemand([
      aRun({ bucketsIdentified: ["health"], bucketsMatched: ["health"] }),
      aRun({ bucketsIdentified: ["health"], bucketsMatched: ["health"] }),
      aRun({ bucketsIdentified: ["health"], bucketsMatched: ["health"] }),
      aRun({ bucketsIdentified: ["legal"], bucketsMatched: [], candidatesFound: 0 }),
    ]);
    expect(summary.demand[0].bucket).toBe("legal");
    expect(summary.demand[1]).toEqual({
      bucket: "health",
      asked: 3,
      unmet: 0,
      unknown: 0,
    });
  });

  it("leaves out buckets nobody asked for", () => {
    const summary = summarizeDemand([aRun()]);
    expect(summary.demand).toHaveLength(1);
    expect(summary.demand[0].bucket).toBe("housing");
  });

  it("counts a bucket once per call, not once per tick", () => {
    const summary = summarizeDemand([
      aRun({
        bucketsIdentified: ["housing", "housing"],
        bucketsMatched: [],
        candidatesFound: 0,
      }),
    ]);
    expect(summary.demand[0]).toMatchObject({ asked: 1, unmet: 1 });
  });

  it("keeps unknowns out of the gap count but still on the page", () => {
    const summary = summarizeDemand([
      aRun({ bucketsMatched: null, candidatesFound: 4 }),
    ]);
    expect(summary.demand[0]).toEqual({
      bucket: "housing",
      asked: 1,
      unmet: 0,
      unknown: 1,
    });
  });

  it("counts the calls that ended with nobody, and the ones that ended early", () => {
    const summary = summarizeDemand([
      aRun({ bucketsIdentified: [], bucketsMatched: [], candidatesFound: 0 }),
      aRun({ bucketsIdentified: ["housing"], bucketsMatched: [], candidatesFound: 0 }),
      aRun(),
    ]);
    expect(summary.intakes).toBe(3);
    expect(summary.emptyHanded).toBe(2);
    expect(summary.nothingChecked).toBe(1);
  });

  it("reports nothing rather than breaking on no intakes at all", () => {
    expect(summarizeDemand([])).toEqual({
      demand: [],
      intakes: 0,
      emptyHanded: 0,
      nothingChecked: 0,
    });
  });
});
