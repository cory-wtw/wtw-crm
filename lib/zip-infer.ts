/**
 * Infer a ZIP from a city and state. Pure functions, no I/O.
 *
 * For backfilling veterans who were entered with a city and no ZIP. Close is
 * good enough: the ZIP feeds a county lookup and a distance, so 37405 for
 * someone who lives in 37402 changes nothing that matters. A city that can't be
 * placed is left blank rather than guessed — a wrong state is worse than none.
 */

export type ZipRow = {
  zip: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
};

export type ZipInference =
  | { ok: true; zip: string; matchedCity: string; state: string; candidates: number }
  | { ok: false; reason: string };

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "puerto rico": "PR", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/** "Georgia", "ga", "Ga." → "GA". Null when it isn't a state. */
export function normalizeState(value: string | undefined): string | null {
  const text = (value ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (!text) return null;
  if (text.length === 2) {
    const code = text.toUpperCase();
    return Object.values(STATE_CODES).includes(code) ? code : null;
  }
  return STATE_CODES[text] ?? null;
}

/**
 * City as a lookup key. Spacing and punctuation vanish ("La Fayette" =
 * "LaFayette", "Soddy-Daisy" = "Soddy Daisy") and the usual abbreviations
 * expand ("Ft Oglethorpe", "St Louis", "Mt Juliet").
 */
export function cityKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word === "ft" ? "fort" : word === "st" ? "saint" : word === "mt" ? "mount" : word === "mtn" ? "mountain" : word,
    )
    .join("");
}

/**
 * Towns with no post office of their own — mail goes to a neighbor's ZIP, so
 * they're missing from postal data. Added as they turn up.
 */
const NON_POSTAL_TOWNS: Record<string, string> = {
  "TN|eastridge": "37412",
  "TN|redbank": "37415",
  "TN|lakesite": "37379",
  "TN|kimball": "37380",
};

export type ZipIndex = Map<string, ZipRow[]>;

/** state|city → every ZIP filed under that city. */
export function buildZipIndex(rows: Iterable<ZipRow>): ZipIndex {
  const index: ZipIndex = new Map();
  for (const row of rows) {
    if (!row.city || !row.state || !/^\d{5}$/.test(row.zip)) continue;
    const key = `${row.state}|${cityKey(row.city)}`;
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  }
  return index;
}

/** The ZIP nearest the middle of a city's ZIPs — downtown, roughly. */
function central(rows: ZipRow[]): ZipRow {
  const lat = rows.reduce((s, r) => s + r.latitude, 0) / rows.length;
  const lon = rows.reduce((s, r) => s + r.longitude, 0) / rows.length;
  const dist = (r: ZipRow) => (r.latitude - lat) ** 2 + (r.longitude - lon) ** 2;
  return rows.reduce((best, r) =>
    dist(r) < dist(best) || (dist(r) === dist(best) && r.zip < best.zip) ? r : best,
  );
}

export function inferZip(
  index: ZipIndex,
  place: { city?: string; state?: string },
): ZipInference {
  const city = place.city?.trim();
  if (!city) return { ok: false, reason: "no city" };

  // "Rossville, GA" typed into the city box with the state left empty.
  let cityText = city;
  let stateText = place.state;
  const inline = /^(.*?)[,\s]+([A-Za-z]{2})$/.exec(city);
  if (!stateText?.trim() && inline && normalizeState(inline[2])) {
    cityText = inline[1];
    stateText = inline[2];
  }

  const key = cityKey(cityText);
  const state = normalizeState(stateText);

  if (state) {
    const alias = NON_POSTAL_TOWNS[`${state}|${key}`];
    if (alias) {
      return { ok: true, zip: alias, matchedCity: cityText, state, candidates: 1 };
    }
    const rows = index.get(`${state}|${key}`);
    if (!rows) return { ok: false, reason: `no city "${cityText}" in ${state}` };
    const pick = central(rows);
    return { ok: true, zip: pick.zip, matchedCity: pick.city, state, candidates: rows.length };
  }

  if (stateText?.trim()) return { ok: false, reason: `unknown state "${stateText}"` };

  // No state: only safe when the city name exists in exactly one state.
  const states = [...index.keys()].filter((k) => k.endsWith(`|${key}`));
  if (states.length === 0) return { ok: false, reason: `no city "${cityText}"` };
  if (states.length > 1) {
    return { ok: false, reason: `"${cityText}" exists in ${states.length} states — add the state` };
  }
  const rows = index.get(states[0])!;
  const pick = central(rows);
  return { ok: true, zip: pick.zip, matchedCity: pick.city, state: pick.state, candidates: rows.length };
}
