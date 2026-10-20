import { describe, expect, it } from "vitest";
import { buildZipIndex, inferZip, normalizeState, type ZipRow } from "./zip-infer";

const row = (zip: string, city: string, state: string, lat: number, lon: number): ZipRow => ({
  zip, city, state, latitude: lat, longitude: lon,
});

const index = buildZipIndex([
  row("30741", "Rossville", "GA", 34.95, -85.3),
  row("30728", "La Fayette", "GA", 34.69, -85.26),
  row("37379", "Soddy Daisy", "TN", 35.25, -85.16),
  row("37401", "Chattanooga", "TN", 35.05, -85.31),
  row("37405", "Chattanooga", "TN", 35.08, -85.33),
  row("37421", "Chattanooga", "TN", 35.03, -85.15),
  row("30742", "Fort Oglethorpe", "GA", 34.95, -85.24),
  row("12866", "Saratoga Springs", "NY", 43.07, -73.74),
  row("31701", "Albany", "GA", 31.58, -84.16),
  row("12207", "Albany", "NY", 42.65, -73.75),
]);

describe("inferZip", () => {
  it("finds a one-ZIP town", () => {
    expect(inferZip(index, { city: "Rossville", state: "GA" })).toMatchObject({ ok: true, zip: "30741" });
  });

  it("ignores spacing, punctuation, case and abbreviations", () => {
    for (const [city, state] of [["LaFayette", "ga"], ["soddy-daisy", "Tennessee"], ["Ft. Oglethorpe", "GA"]]) {
      expect(inferZip(index, { city, state }).ok).toBe(true);
    }
  });

  it("picks a central ZIP for a city with several", () => {
    const result = inferZip(index, { city: "Chattanooga", state: "TN" });
    expect(result.ok && ["37401", "37405"]).toContain(result.ok && result.zip);
  });

  it("reads a state typed into the city box", () => {
    expect(inferZip(index, { city: "Rossville, GA" })).toMatchObject({ ok: true, zip: "30741" });
  });

  it("infers the state only when the city is unique", () => {
    expect(inferZip(index, { city: "Saratoga Springs" })).toMatchObject({ ok: true, state: "NY" });
    expect(inferZip(index, { city: "Albany" }).ok).toBe(false);
  });

  it("knows towns that use a neighbor's ZIP", () => {
    expect(inferZip(index, { city: "East Ridge", state: "TN" })).toMatchObject({ ok: true, zip: "37412" });
  });

  it("leaves blank what it can't place", () => {
    expect(inferZip(index, { city: "Nowhereville", state: "GA" }).ok).toBe(false);
    expect(inferZip(index, { state: "GA" }).ok).toBe(false);
  });
});

describe("normalizeState", () => {
  it("accepts codes and names", () => {
    expect(normalizeState("Georgia")).toBe("GA");
    expect(normalizeState("tn")).toBe("TN");
    expect(normalizeState("XX")).toBeNull();
  });
});
