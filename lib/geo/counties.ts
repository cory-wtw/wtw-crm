/**
 * Where a veteran lives and where a resource serves, as places on a map.
 * Server-only data, pure functions.
 *
 * Every US ZIP with its city, county and centre point, from GeoNames
 * (geonames.org, CC BY 4.0) — see lib/geo/us-zips.json and
 * scripts/build-zip-data.py. Resources list counties ("Walker County") and
 * towns ("LaFayette"); veterans give a ZIP or a city. Both resolve here to a
 * county and a point, so "same county" is exact and "nearby" is a distance —
 * nationwide, not a hand-kept table for one metro.
 */

import data from "./us-zips.json";
import { cityKey, type ZipRow } from "@/lib/zip-infer";

/** zip → [city, state, county, latitude, longitude] */
const ZIPS = data as unknown as Record<string, [string, string, string, number, number]>;

export type Place = {
  state: string;
  /** Lower-case county name without "County" — "walker". */
  county: string;
  latitude: number;
  longitude: number;
};

export type Point = { latitude: number; longitude: number };

/** Every ZIP as a row, for the ZIP-from-city inference. */
export function zipRows(): ZipRow[] {
  return Object.entries(ZIPS).map(([zip, [city, state, , latitude, longitude]]) => ({
    zip,
    city,
    state,
    latitude,
    longitude,
  }));
}

function countyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/ (county|co|parish|borough|census area|city and borough)$/, "")
    .trim();
}

function centroid(points: Point[]): Point {
  return {
    latitude: points.reduce((s, p) => s + p.latitude, 0) / points.length,
    longitude: points.reduce((s, p) => s + p.longitude, 0) / points.length,
  };
}

type Indexes = {
  counties: Map<string, Place>;
  cities: Map<string, Place>;
};

let indexes: Indexes | null = null;

/** state|county and state|city → a centre point, built once per process. */
function index(): Indexes {
  if (indexes) return indexes;
  const countyPoints = new Map<string, { state: string; county: string; points: Point[] }>();
  const cityPoints = new Map<string, { state: string; counties: Map<string, number>; points: Point[] }>();

  for (const [city, state, countyRaw, latitude, longitude] of Object.values(ZIPS)) {
    const county = countyName(countyRaw);
    const point = { latitude, longitude };

    const ck = `${state}|${county}`;
    const c = countyPoints.get(ck) ?? { state, county, points: [] as Point[] };
    c.points.push(point);
    countyPoints.set(ck, c);

    const tk = `${state}|${cityKey(city)}`;
    const t = cityPoints.get(tk) ?? { state, counties: new Map<string, number>(), points: [] as Point[] };
    t.points.push(point);
    t.counties.set(county, (t.counties.get(county) ?? 0) + 1);
    cityPoints.set(tk, t);
  }

  const counties = new Map<string, Place>();
  for (const [k, c] of countyPoints) {
    counties.set(k, { state: c.state, county: c.county, ...centroid(c.points) });
  }
  const cities = new Map<string, Place>();
  for (const [k, t] of cityPoints) {
    // A city spanning counties belongs to the one most of its ZIPs are in.
    const county = [...t.counties.entries()].sort((a, b) => b[1] - a[1])[0][0];
    cities.set(k, { state: t.state, county, ...centroid(t.points) });
  }
  indexes = { counties, cities };
  return indexes;
}

/** A ZIP's own place. */
export function placeForZip(zip: string | undefined): Place | null {
  const row = zip ? ZIPS[zip.trim().slice(0, 5)] : undefined;
  if (!row) return null;
  const [, state, county, latitude, longitude] = row;
  return { state, county: countyName(county), latitude, longitude };
}

/** A city's place: its county and the middle of its ZIPs. */
export function placeForCity(city: string, state: string): Place | null {
  return index().cities.get(`${state.trim().toUpperCase()}|${cityKey(city)}`) ?? null;
}

/**
 * Where the veteran lives. ZIP first — it can't be misspelled into another
 * town — then city and state.
 */
export function placeForVeteran(v: { zip?: string; city?: string; state?: string }): Place | null {
  return (
    placeForZip(v.zip) ??
    (v.city && v.state ? placeForCity(v.city, v.state) : null)
  );
}

/** Words that are never the place itself in "Greater Chattanooga area". */
const FILLER = new Set([
  "greater", "metro", "area", "region", "regional", "the", "of", "and", "city",
  "north", "south", "east", "west", "central", "northern", "southern",
  "eastern", "western", "northwest", "northeast", "southwest", "southeast",
  "nw", "ne", "sw", "se", "surrounding", "counties", "county", "co",
]);

const STATE_WORDS: Record<string, string> = {
  alabama: "AL", georgia: "GA", tennessee: "TN", "north carolina": "NC",
  "south carolina": "SC", kentucky: "KY", virginia: "VA", florida: "FL",
  mississippi: "MS", "new york": "NY",
};

/**
 * Every county or city a resource's locality string names, read against the
 * states it serves. "Walker County", "Walker Co., GA", "LaFayette",
 * "Greater Chattanooga", "Walker County, Catoosa County" all resolve.
 */
export function placesForLocality(locality: string, resourceStates: string[]): Place[] {
  const { counties, cities } = index();
  const found: Place[] = [];
  const add = (p: Place | undefined) => {
    if (p && !found.includes(p)) found.push(p);
  };

  for (const part of locality.split(/[,;/]| and | & /i)) {
    let text = part.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;

    // A trailing state narrows the lookup: "..., GA" or "Georgia".
    let states = resourceStates.map((s) => s.toUpperCase());
    for (const [name, code] of Object.entries(STATE_WORDS)) {
      if (text === name || text.endsWith(` ${name}`)) {
        states = [code];
        text = text.slice(0, -name.length).trim();
      }
    }
    const last = text.split(" ").pop() ?? "";
    if (last.length === 2 && /^[a-z]{2}$/.test(last) && !["co"].includes(last)) {
      const code = last.toUpperCase();
      if (resourceStates.includes(code) || Object.values(STATE_WORDS).includes(code)) {
        states = [code];
        text = text.slice(0, -2).trim();
      }
    }
    if (!text) continue;

    const county = /^(.*?)\s+(county|co|parish)$/.exec(text)?.[1];
    for (const state of states) {
      if (county) {
        add(counties.get(`${state}|${countyName(county)}`));
        continue;
      }
      // Longest run of words that names a city: "lookout mountain" before
      // "mountain", and filler like "greater" or "area" never on its own.
      const words = text.split(" ");
      const used = new Array(words.length).fill(false);
      for (let len = Math.min(4, words.length); len >= 1; len--) {
        for (let i = 0; i + len <= words.length; i++) {
          if (used.slice(i, i + len).some(Boolean)) continue;
          const span = words.slice(i, i + len);
          if (len === 1 && FILLER.has(span[0])) continue;
          const place = cities.get(`${state}|${cityKey(span.join(" "))}`);
          if (place) {
            add(place);
            for (let j = i; j < i + len; j++) used[j] = true;
          }
        }
      }
    }
  }
  return found;
}

export function sameCounty(a: Place, b: Place): boolean {
  return a.state === b.state && a.county === b.county;
}

/** Straight-line miles between two points. */
export function milesBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
