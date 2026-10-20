import { describe, expect, it } from "vitest";
import { countiesForLocality, countyForPlace } from "./counties";

describe("countyForPlace", () => {
  it("resolves Rossville by ZIP and by city", () => {
    const walker = { state: "GA", county: "walker" };
    expect(countyForPlace({ zip: "30741" })).toEqual(walker);
    expect(countyForPlace({ city: "Rossville", state: "GA" })).toEqual(walker);
    expect(countyForPlace({ city: "rossville", state: "ga" })).toEqual(walker);
  });

  it("returns null for a place it doesn't know", () => {
    expect(countyForPlace({ city: "Albany", state: "NY" })).toBeNull();
  });
});

describe("countiesForLocality", () => {
  it("reads county names in their common spellings", () => {
    for (const text of ["Walker County", "Walker Co.", "Walker County, GA"]) {
      expect(countiesForLocality(text, ["GA"])).toEqual([
        { state: "GA", county: "walker" },
      ]);
    }
  });

  it("reads a list in one string", () => {
    expect(
      countiesForLocality("Walker County, Catoosa County", ["GA"]),
    ).toHaveLength(2);
  });

  it("reads a town to its county", () => {
    expect(countiesForLocality("Greater Chattanooga", ["TN"])).toEqual([
      { state: "TN", county: "hamilton" },
    ]);
  });
});
