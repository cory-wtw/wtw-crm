// VA Facilities import.
//
// Usage:
//   npm run import-va-facilities                     # DRY RUN — reports only
//   npm run import-va-facilities -- --commit         # actually writes
//   npm run import-va-facilities -- --type=vet_center
//   npm run import-va-facilities -- --limit=50 --commit
//   npm run import-va-facilities -- --remap-gates --commit
//   npm run import-va-facilities -- --sandbox --limit=25
//
// Pulls health, vet_center, and benefits facilities nationally from
// developer.va.gov and writes them into `resources`, keyed on the VA facility
// id so a re-run updates rather than duplicates.
//
// Everything lands `flagged`. Nothing imported here is ever offered to a
// veteran until a person has reviewed it — see §6.2. The gate values come from
// a per-type table in ./va-facility-mapping.ts, not from any field the API
// supplies, and the guesses in it are documented there and printed in the
// summary below.
//
// Needs VA_FACILITIES_API_KEY in .env.local (free key from developer.va.gov).
//
// Sandbox vs production:
//   A sandbox key only authenticates against the sandbox host, and a
//   production key only against the production one — pointing either at the
//   wrong base returns 401, which looks exactly like a bad key. Pass
//   --sandbox (or set VA_FACILITIES_API_BASE) to switch. Sandbox data may be a
//   limited or synthetic subset, so read what the dry run reports before
//   committing it into a directory staff will use.
//
// Re-run behaviour:
//   By default an existing record has only its API-owned facts refreshed —
//   name, phone, website, address, state. Buckets, gates, and verification
//   status are left alone, because by then a human may have corrected them and
//   a nightly-style overwrite would quietly undo that work. Pass --remap-gates
//   to re-apply the type mapping (use after editing the mapping table).
import { adminDb } from "@/lib/firebase/admin";
import {
  mapFacility,
  TYPE_MAPPING,
  VA_FACILITY_TYPES,
  type MappedFacility,
  type VaFacility,
  type VaFacilityType,
} from "./va-facility-mapping";

const COMMIT = process.argv.includes("--commit");
const REMAP_GATES = process.argv.includes("--remap-gates");

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const ONLY_TYPE = argValue("type") as VaFacilityType | undefined;
const LIMIT = Number(argValue("limit") ?? "") || undefined;

const PRODUCTION_BASE = "https://api.va.gov/services/va_facilities/v1";
const SANDBOX_BASE = "https://sandbox-api.va.gov/services/va_facilities/v1";

const SANDBOX = process.argv.includes("--sandbox");
/** Explicit override wins, then --sandbox, then production. */
const API_BASE = (
  process.env.VA_FACILITIES_API_BASE ??
  (SANDBOX ? SANDBOX_BASE : PRODUCTION_BASE)
).replace(/\/$/, "");
const API_ROOT = `${API_BASE}/facilities`;
const PAGE_SIZE = 100;
/** Stop rather than hammer the API if pagination ever fails to terminate. */
const MAX_PAGES = 200;

const SOURCE_NAME = "VA Facilities API";

type Counts = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skippedNoState: number;
};

function emptyCounts(): Counts {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedNoState: 0,
  };
}

async function fetchPage(
  type: VaFacilityType,
  page: number,
  apiKey: string,
): Promise<VaFacility[]> {
  const url = `${API_ROOT}?type=${type}&page=${page}&per_page=${PAGE_SIZE}`;
  const response = await fetch(url, {
    headers: { apikey: apiKey, accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const hint =
      response.status === 401 || response.status === 403
        ? ` — a sandbox key only works against ${SANDBOX_BASE} and a production key only against ${PRODUCTION_BASE}. Currently using ${API_BASE}. Pass --sandbox to switch.`
        : "";
    throw new Error(
      `VA Facilities API ${response.status} on ${type} page ${page}: ${body.slice(0, 300)}${hint}`,
    );
  }

  const payload = (await response.json()) as { data?: VaFacility[] };
  return payload.data ?? [];
}

/** Every facility of one type, walking pages until one comes back short. */
async function fetchType(
  type: VaFacilityType,
  apiKey: string,
): Promise<VaFacility[]> {
  const all: VaFacility[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchPage(type, page, apiKey);
    all.push(...batch);
    process.stdout.write(`\r  ${type}: fetched ${all.length}…`);
    if (batch.length < PAGE_SIZE) break;
    if (LIMIT && all.length >= LIMIT) break;
  }
  process.stdout.write("\n");
  return LIMIT ? all.slice(0, LIMIT) : all;
}

/**
 * externalId -> doc id, read once.
 *
 * One full-collection read beats one query per facility, and the directory is
 * small enough that this is cheaper than it looks — the same tradeoff the rest
 * of the codebase makes.
 */
async function loadExistingByExternalId(): Promise<Map<string, string>> {
  const snap = await adminDb.collection("resources").get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const externalId = doc.data().externalId;
    if (typeof externalId === "string") map.set(externalId, doc.id);
  }
  return map;
}

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

async function writeAll(
  writes: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; create: boolean }[],
): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) {
      if (write.create) batch.set(write.ref, write.data);
      else batch.update(write.ref, write.data);
    }
    await batch.commit();
    process.stdout.write(
      `\r  wrote ${Math.min(i + BATCH_LIMIT, writes.length)} of ${writes.length}…`,
    );
  }
  if (writes.length > 0) process.stdout.write("\n");
}

function createDoc(mapped: MappedFacility, now: Date): Record<string, unknown> {
  return {
    ...mapped.facts,
    ...mapped.gates,
    externalId: mapped.externalId,
    sourceName: SOURCE_NAME,
    fragility: "stable",
    // Never live. A wrong gate value silently misroutes veterans, so an
    // imported record waits for a human before it can be offered to anybody.
    verificationStatus: "flagged",
    flagReason: "Imported from the VA Facilities API. Needs review.",
    lastVerified: null,
    lastVerifiedBy: "system",
    createdBy: "system",
    createdAt: now,
    updatedBy: "system",
    updatedAt: now,
  };
}

function updateDoc(mapped: MappedFacility, now: Date): Record<string, unknown> {
  return {
    // Facts the API owns. Deliberately NOT verificationStatus, buckets, or the
    // gates: a person may have corrected those, and a re-run must not undo it.
    ...mapped.facts,
    ...(REMAP_GATES ? mapped.gates : {}),
    externalId: mapped.externalId,
    sourceName: SOURCE_NAME,
    updatedBy: "system",
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.VA_FACILITIES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VA_FACILITIES_API_KEY is not set. Get a free key from developer.va.gov and add it to .env.local.",
    );
  }

  const types = ONLY_TYPE ? [ONLY_TYPE] : [...VA_FACILITY_TYPES];
  for (const type of types) {
    if (!VA_FACILITY_TYPES.includes(type)) {
      throw new Error(
        `Unknown --type=${type}. One of: ${VA_FACILITY_TYPES.join(", ")}.`,
      );
    }
  }

  console.log(
    COMMIT
      ? "Importing VA facilities (COMMIT — writing changes)…"
      : "Importing VA facilities (DRY RUN — no writes)…",
  );
  if (REMAP_GATES) {
    console.log(
      "  --remap-gates: existing records will have their gate values re-applied.",
    );
  }
  if (LIMIT) console.log(`  --limit=${LIMIT} per type.`);
  console.log(`  Endpoint: ${API_BASE}`);
  if (API_BASE !== PRODUCTION_BASE && COMMIT) {
    console.log(
      "  WARNING: committing non-production data into the resources directory.",
    );
  }

  const existing = await loadExistingByExternalId();
  console.log(`Loaded ${existing.size} previously imported records.\n`);

  const now = new Date();
  const perType: Record<string, Counts> = {};
  const writes: {
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
    create: boolean;
  }[] = [];
  const byState = new Map<string, number>();
  // Guard against the API returning the same facility under two pages.
  const seen = new Set<string>();

  for (const type of types) {
    const counts = emptyCounts();
    perType[type] = counts;

    const facilities = await fetchType(type, apiKey);
    counts.fetched = facilities.length;

    for (const facility of facilities) {
      const mapped = mapFacility(facility, type);
      if (!mapped) {
        counts.skippedNoState++;
        continue;
      }
      if (seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);

      byState.set(mapped.state, (byState.get(mapped.state) ?? 0) + 1);

      const existingId = existing.get(mapped.externalId);
      if (existingId) {
        counts.updated++;
        writes.push({
          ref: adminDb.collection("resources").doc(existingId),
          data: updateDoc(mapped, now),
          create: false,
        });
      } else {
        counts.created++;
        writes.push({
          ref: adminDb.collection("resources").doc(),
          data: createDoc(mapped, now),
          create: true,
        });
      }
    }
  }

  if (COMMIT) {
    await writeAll(writes);
  }

  console.log("\nSummary:");
  for (const type of types) {
    const counts = perType[type];
    console.log(`  ${type}`);
    console.log(`    fetched:          ${counts.fetched}`);
    console.log(`    new records:      ${counts.created}`);
    console.log(`    existing updated: ${counts.updated}`);
    console.log(`    skipped, no state:${counts.skippedNoState}`);
    console.log(
      `    buckets:          ${TYPE_MAPPING[type].buckets.join(", ")}`,
    );
  }

  // Named, with counts, not just tallied. "States covered: 10" doesn't answer
  // the only question that matters before committing — is the state we work in
  // actually in here? A subset that skips Tennessee is worse than no import,
  // because the directory then looks stocked and still has nothing local.
  const states = [...byState.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  console.log(`\n  States covered: ${states.length}`);
  console.log(
    `    ${states.map(([code, count]) => `${code} ${count}`).join(" · ")}`,
  );
  console.log(`  Total records:  ${writes.length}`);

  console.log("\nEverything lands verificationStatus=flagged and is invisible");
  console.log("to matching until a person reviews it. Gate values are mapped");
  console.log("per facility type — see scripts/va-facility-mapping.ts for the");
  console.log("guesses and why each one errs the way it does.");

  if (!COMMIT) {
    console.log("\nDry run only. Re-run with `-- --commit` to apply.");
  } else {
    console.log("\nDone.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
