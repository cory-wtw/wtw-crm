/**
 * City and ZIP → county, for the region this program serves. Pure data and
 * pure functions, no I/O.
 *
 * Resources record their service area as counties ("Walker County"); veterans
 * record a city and state ("Rossville, GA"). Without this table the two never
 * meet, and a resource that names the veteran's county outright gets gated out
 * as "outside their city or county".
 *
 * Deliberately regional, not national: a hand-checked table for the Chattanooga
 * area beats a 40,000-row import nobody reviews. A place missing here falls
 * back to plain text matching, exactly as before — add it when it turns up.
 */

/** A county, keyed with its state so Walker County, GA ≠ Walker County, AL. */
export type County = { state: string; county: string };

/**
 * Counties close enough to cross for help. Rossville sits on the Chattanooga
 * line; a resource in Hamilton County is a ten-minute drive, and the state
 * border between them means nothing to the bus.
 */
const CHATTANOOGA_METRO = new Set([
  "TN:hamilton",
  "TN:marion",
  "TN:sequatchie",
  "TN:bradley",
  "GA:walker",
  "GA:catoosa",
  "GA:dade",
  "GA:whitfield",
]);

/**
 * Counties that share a border, around the metro. One direction is enough —
 * adjacentCounties checks both.
 */
const BORDERS: [string, string[]][] = [
  ["GA:walker", ["GA:catoosa", "GA:dade", "GA:chattooga", "GA:whitfield", "TN:hamilton"]],
  ["GA:catoosa", ["GA:whitfield", "TN:hamilton"]],
  ["GA:dade", ["TN:hamilton", "TN:marion", "AL:jackson", "AL:dekalb"]],
  ["GA:whitfield", ["GA:murray", "TN:hamilton", "TN:bradley"]],
  ["GA:murray", ["TN:bradley", "TN:polk"]],
  ["GA:chattooga", ["AL:dekalb", "AL:cherokee"]],
  ["TN:hamilton", ["TN:marion", "TN:sequatchie", "TN:bledsoe", "TN:rhea", "TN:meigs", "TN:bradley"]],
  ["TN:marion", ["TN:sequatchie", "TN:grundy", "TN:franklin", "AL:jackson"]],
  ["TN:bradley", ["TN:meigs", "TN:mcminn", "TN:polk"]],
];

const ADJACENT = new Set(
  BORDERS.flatMap(([a, bs]) => bs.flatMap((b) => [`${a}|${b}`, `${b}|${a}`])),
);

const CITY_COUNTY: Record<string, Record<string, string>> = {
  GA: {
    rossville: "walker",
    lafayette: "walker",
    "la fayette": "walker",
    chickamauga: "walker",
    "rock spring": "walker",
    flintstone: "walker",
    "lookout mountain": "walker",
    "fort oglethorpe": "catoosa",
    "ft oglethorpe": "catoosa",
    ringgold: "catoosa",
    trenton: "dade",
    "rising fawn": "dade",
    wildwood: "dade",
    dalton: "whitfield",
    "tunnel hill": "whitfield",
    "rocky face": "whitfield",
    varnell: "whitfield",
    chatsworth: "murray",
    eton: "murray",
    summerville: "chattooga",
    trion: "chattooga",
  },
  TN: {
    chattanooga: "hamilton",
    "east ridge": "hamilton",
    "red bank": "hamilton",
    "signal mountain": "hamilton",
    "lookout mountain": "hamilton",
    "soddy daisy": "hamilton",
    hixson: "hamilton",
    ooltewah: "hamilton",
    collegedale: "hamilton",
    harrison: "hamilton",
    "sale creek": "hamilton",
    apison: "hamilton",
    cleveland: "bradley",
    jasper: "marion",
    "south pittsburg": "marion",
    kimball: "marion",
    whitwell: "marion",
    dunlap: "sequatchie",
  },
};

const ZIP_COUNTY: Record<string, County> = Object.fromEntries(
  (
    [
      ["GA", "walker", ["30741", "30728", "30707", "30739", "30750", "30725"]],
      ["GA", "catoosa", ["30742", "30736"]],
      ["GA", "dade", ["30752", "30738", "30757"]],
      ["GA", "whitfield", ["30720", "30721", "30755", "30740"]],
      ["GA", "murray", ["30705"]],
      ["GA", "chattooga", ["30747"]],
      [
        "TN",
        "hamilton",
        [
          "37401", "37402", "37403", "37404", "37405", "37406", "37407",
          "37408", "37409", "37410", "37411", "37412", "37415", "37416",
          "37419", "37421", "37343", "37363", "37377", "37379", "37350",
          "37341", "37373", "37302", "37315",
        ],
      ],
      ["TN", "bradley", ["37311", "37312", "37323"]],
      ["TN", "marion", ["37347", "37380", "37397"]],
      ["TN", "sequatchie", ["37327"]],
    ] as const
  ).flatMap(([state, county, zips]) =>
    zips.map((zip) => [zip, { state, county }] as const),
  ),
);

const STATE_NAMES: Record<string, string> = {
  georgia: "GA",
  tennessee: "TN",
  alabama: "AL",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function key(c: County): string {
  return `${c.state}:${c.county}`;
}

export function sameCounty(a: County, b: County): boolean {
  return key(a) === key(b);
}

/** The two counties share a border, state line or not. */
export function adjacentCounties(a: County, b: County): boolean {
  return ADJACENT.has(`${key(a)}|${key(b)}`);
}

/** Both counties sit in the Chattanooga metro, on either side of the line. */
export function nearbyCounties(a: County, b: County): boolean {
  return CHATTANOOGA_METRO.has(key(a)) && CHATTANOOGA_METRO.has(key(b));
}

/**
 * The county a veteran lives in, from whatever the record holds. ZIP wins when
 * it's known, since a ZIP can't be misspelled into another town.
 */
export function countyForPlace(place: {
  zip?: string;
  city?: string;
  state?: string;
}): County | null {
  const zip = place.zip?.trim().slice(0, 5);
  if (zip && ZIP_COUNTY[zip]) return ZIP_COUNTY[zip];

  const state = place.state?.trim().toUpperCase();
  const city = place.city ? normalize(place.city) : "";
  if (!state || !city) return null;
  const county = CITY_COUNTY[state]?.[city];
  return county ? { state, county } : null;
}

/**
 * Every county a resource's locality string names, read against the states the
 * resource serves.
 *
 * "Walker County", "Walker Co.", "Walker County, GA", "LaFayette",
 * "Greater Chattanooga" — each resolves. A list in one string ("Walker County,
 * Catoosa County") resolves to all of them.
 */
export function countiesForLocality(
  locality: string,
  resourceStates: string[],
): County[] {
  const found: County[] = [];
  const add = (c: County) => {
    if (!found.some((f) => sameCounty(f, c))) found.push(c);
  };

  for (const part of locality.split(/[,;/]| and /i)) {
    let text = normalize(part);
    if (!text) continue;

    // A trailing state ("..., GA" or "Georgia") narrows the lookup.
    let states = resourceStates.map((s) => s.toUpperCase());
    const words = text.split(" ");
    const last = words[words.length - 1];
    const named = STATE_NAMES[last] ?? (last.length === 2 ? last.toUpperCase() : null);
    if (named && (CITY_COUNTY[named] || Object.values(STATE_NAMES).includes(named))) {
      states = [named];
      text = words.slice(0, -1).join(" ");
    }
    // A bare state code on its own segment ("Walker County, GA") is not a place.
    if (!text) continue;

    const county = /^(.*?)\s+(county|co)$/.exec(text)?.[1];
    for (const state of states) {
      if (county) {
        add({ state, county });
        continue;
      }
      const cities = CITY_COUNTY[state] ?? {};
      for (const [city, c] of Object.entries(cities)) {
        if (` ${text} `.includes(` ${city} `)) add({ state, county: c });
      }
    }
  }
  return found;
}
