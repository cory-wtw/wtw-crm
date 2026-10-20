// Backfill a ZIP on every veteran that has a city but no ZIP.
//
// Usage:
//   npm run infer-veteran-zips              # DRY RUN — prints only
//   npm run infer-veteran-zips -- --commit  # actually writes
//
// Close is good enough: the ZIP feeds the county lookup and distance, so a
// central Chattanooga ZIP for someone in 37402 changes nothing that matters.
// A city that can't be placed is left blank and listed, so somebody can ask on
// the next call. An existing ZIP is never touched.
//
// ZIP data comes from the `zipcodes` package (dev dependency, script-only).
import { createRequire } from "node:module";
import { adminDb } from "@/lib/firebase/admin";
import { buildZipIndex, inferZip, type ZipRow } from "@/lib/zip-infer";

const COMMIT = process.argv.includes("--commit");
const ACTOR = "system";

const require = createRequire(import.meta.url);
const { codes } = require("zipcodes/lib/codes.js") as {
  codes: Record<string, ZipRow>;
};

async function main() {
  const index = buildZipIndex(Object.values(codes));
  const snap = await adminDb.collection("veterans").get();

  const inferred: { id: string; name: string; from: string; zip: string; note: string }[] = [];
  const unresolved: { id: string; name: string; from: string; reason: string }[] = [];
  let alreadyHad = 0;

  for (const doc of snap.docs) {
    const v = doc.data();
    const name = `${v.firstName ?? "?"} ${v.lastInitial ?? ""}`.trim();
    if (typeof v.zip === "string" && v.zip.trim()) {
      alreadyHad++;
      continue;
    }
    const from = [v.city, v.state].filter(Boolean).join(", ") || "(no city or state)";
    const result = inferZip(index, { city: v.city, state: v.state });
    if (!result.ok) {
      unresolved.push({ id: doc.id, name, from, reason: result.reason });
      continue;
    }
    inferred.push({
      id: doc.id,
      name,
      from,
      zip: result.zip,
      note:
        result.candidates > 1
          ? `${result.matchedCity}, ${result.state} — central of ${result.candidates} ZIPs`
          : `${result.matchedCity}, ${result.state}`,
    });
  }

  console.log(`\n${snap.size} veterans · ${alreadyHad} already have a ZIP`);
  console.log(`\nInferred (${inferred.length}):`);
  for (const r of inferred) console.log(`  ${r.zip}  ${r.name.padEnd(16)} ${r.from.padEnd(28)} ${r.note}`);
  console.log(`\nCouldn't place (${unresolved.length}) — ask on the next call:`);
  for (const r of unresolved) console.log(`  ${r.name.padEnd(16)} ${r.from.padEnd(28)} ${r.reason}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to save.");
    return;
  }

  const now = new Date();
  // Batches cap at 500 writes; each veteran is two (record + audit entry).
  for (let i = 0; i < inferred.length; i += 200) {
    const batch = adminDb.batch();
    for (const r of inferred.slice(i, i + 200)) {
      batch.update(adminDb.collection("veterans").doc(r.id), {
        zip: r.zip,
        updatedBy: ACTOR,
        updatedAt: now,
      });
      batch.set(adminDb.collection("auditLog").doc(), {
        actorUid: ACTOR,
        actorEmail: ACTOR,
        action: "update",
        resourceType: "veteran",
        resourceId: r.id,
        diff: { zip: { before: null, after: r.zip } },
        at: now,
      });
    }
    await batch.commit();
  }
  console.log(`\nWrote ${inferred.length} ZIPs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
