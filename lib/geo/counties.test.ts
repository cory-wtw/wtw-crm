import { describe, expect, it } from "vitest";
import {
  milesBetween,
  placeForVeteran,
  placesForLocality,
  sameCounty,
} from "./counties";

describe("placeForVeteran", () => {
  it("resolves Rossville by ZIP and by city", () => {
    expect(placeForVeteran({ zip: "30741" })).toMatchObject({ state: "GA", county: "walker" });
    expect(placeForVeteran({ city: "Rossville", state: "GA" })).toMatchObject({ county: "walker" });
    expect(placeForVeteran({ city: "rossville", state: "GA" })).toMatchObject({ county: "walker" });
  });

  it("works anywhere in the country", () => {
    expect(placeForVeteran({ zip: "12866" })).toMatchObject({ state: "NY", county: "saratoga" });
    expect(placeForVeteran({ city: "Boise", state: "ID" })).toMatchObject({ county: "ada" });
  });

  it("returns null for a place it doesn't know", () => {
    expect(placeForVeteran({ city: "Nowhereville", state: "GA" })).toBeNull();
  });
});

describe("placesForLocality", () => {
  it("reads county names in their common spellings", () => {
    for (const text of ["Walker County", "Walker Co.", "Walker County, GA", "walker county georgia"]) {
      const places = placesForLocality(text, ["GA"]);
      expect(places).toHaveLength(1);
      expect(places[0]).toMatchObject({ state: "GA", county: "walker" });
    }
  });

  it("reads a list in one string", () => {
    expect(placesForLocality("Walker County, Catoosa County", ["GA"])).toHaveLength(2);
  });

  it("reads a town to its county, ignoring filler words", () => {
    expect(placesForLocality("Greater Chattanooga area", ["TN"])).toEqual([
      expect.objectContaining({ county: "hamilton" }),
    ]);
    expect(placesForLocality("LaFayette", ["GA"])).toEqual([
      expect.objectContaining({ county: "walker" }),
    ]);
  });
});

describe("distance", () => {
  it("puts Rossville next to Chattanooga and far from Atlanta", () => {
    const rossville = placeForVeteran({ zip: "30741" })!;
    const [chattanooga] = placesForLocality("Chattanooga", ["TN"]);
    const [atlanta] = placesForLocality("Atlanta", ["GA"]);
    expect(milesBetween(rossville, chattanooga)).toBeLessThan(15);
    expect(milesBetween(rossville, atlanta)).toBeGreaterThan(80);
    expect(sameCounty(rossville, chattanooga)).toBe(false);
  });
});

describe("review fixes", () => {
  it("lets a trailing state narrow the county before it", () => {
    const places = placesForLocality("Walker County, GA", ["GA", "AL"]);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ state: "GA", county: "walker" });
  });

  it("finds a county inside a longer phrase", () => {
    expect(placesForLocality("Serving Walker County", ["GA"])[0]).toMatchObject({ county: "walker" });
    expect(placesForLocality("Hamilton County area", ["TN"])[0]).toMatchObject({ county: "hamilton" });
  });

  it("matches Saint / St. county spellings", () => {
    expect(placesForLocality("Saint Clair County", ["AL"])).toHaveLength(1);
    expect(placesForLocality("St. Clair County", ["AL"])).toHaveLength(1);
  });

  it("reads West Virginia as WV, and a full state name for a city", () => {
    expect(placesForLocality("Charleston, West Virginia", ["WV", "VA"])[0]).toMatchObject({ state: "WV" });
    expect(placeForVeteran({ city: "Rossville", state: "Georgia" })).toMatchObject({ county: "walker" });
  });
});
