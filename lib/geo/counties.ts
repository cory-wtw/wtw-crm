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
import {
  cityKey,
  normalizeState,
  trailingState,
  type ZipRow,
} from "@/lib/zip-infer";

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

/**
 * County as a lookup key: "St. Clair County" = "Saint Clair", and GeoNames'
 * "City and County of San Francisco" = "San Francisco County".
 */
function countyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(city and county of|city and borough of|county of|city of) /, "")
    .replace(/ (county|co|parish|borough|census area|city and borough|municipality)$/, "")
    .split(" ")
    .map((w) => (w === "st" ? "saint" : w === "ste" ? "sainte" : w))
    .join(" ");
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
  const code = normalizeState(state);
  return code ? (index().cities.get(`${code}|${cityKey(city)}`) ?? null) : null;
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

const COUNTY_WORDS = new Set(["county", "counties", "co", "parish", "parishes"]);

const cache = new Map<string, Place[]>();

/**
 * Every county or city a resource's locality string names, read against the
 * states it serves. "Walker County", "Walker Co., GA", "Serving Walker
 * County", "Hamilton County area", "LaFayette", "Greater Chattanooga",
 * "Walker County, Catoosa County" all resolve. Cached: the same few locality
 * strings are read on every intake.
 */
export function placesForLocality(locality: string, resourceStates: string[]): Place[] {
  const cacheKey = `${resourceStates.join(",")}|${locality}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const { counties, cities } = index();
  const found: Place[] = [];
  const add = (p: Place | undefined) => {
    if (p && !found.includes(p)) found.push(p);
  };

  // Parts, each with the states it may be in. A part that is only a state
  // ("Walker County, GA" → "GA") narrows the part before it.
  const parts: { text: string; states: string[] }[] = [];
  for (const raw of locality.split(/[,;/]| and | & /i)) {
    let text = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let states = resourceStates.map((s) => s.toUpperCase());
    const tail = trailingState(text);
    if (tail) {
      if (!tail.rest) {
        if (parts.length > 0) parts[parts.length - 1].states = [tail.state];
        continue;
      }
      states = [tail.state];
      text = tail.rest;
    }
    parts.push({ text, states });
  }

  for (const { text, states } of parts) {
    const words = text.split(" ");
    const used = new Array<boolean>(words.length).fill(false);

    for (const state of states) {
      // Counties: the one to three words just before "County", longest that
      // exists — so "serving walker county" finds Walker, not "serving walker".
      words.forEach((word, at) => {
        if (!COUNTY_WORDS.has(word)) return;
        for (let len = Math.min(3, at); len >= 1; len--) {
          const place = counties.get(`${state}|${countyName(words.slice(at - len, at).join(" "))}`);
          if (place) {
            add(place);
            for (let j = at - len; j <= at; j++) used[j] = true;
            return;
          }
        }
      });

      // Cities: the longest run of words that names one — "lookout mountain"
      // before "mountain", and filler like "greater" or "area" never alone.
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

  cache.set(cacheKey, found);
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
