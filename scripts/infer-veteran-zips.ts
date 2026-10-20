// Backfill a ZIP on every veteran that has a city but no ZIP.
//
// Usage:
//   npm run infer-veteran-zips              # DRY RUN — prints only
//   npm run infer-veteran-zips -- --commit  # actually writes
//
// The same logic as Admin → Fill in ZIPs (lib/zip-backfill.ts), for when a
// laptop is handier than a phone. An existing ZIP is never touched.
import { applyZipBackfill, planZipBackfill } from "@/lib/zip-backfill";

const COMMIT = process.argv.includes("--commit");

async function main() {
  const plan = await planZipBackfill();

  console.log(`\n${plan.total} veterans · ${plan.alreadyHad} already have a ZIP`);
  console.log(`\nInferred (${plan.inferred.length}):`);
  for (const r of plan.inferred) {
    console.log(`  ${r.zip}  ${r.name.padEnd(16)} ${r.from.padEnd(28)} ${r.note}`);
  }
  console.log(`\nCouldn't place (${plan.unresolved.length}) — ask on the next call:`);
  for (const r of plan.unresolved) {
    console.log(`  ${r.name.padEnd(16)} ${r.from.padEnd(28)} ${r.reason}`);
  }

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to save.");
    return;
  }
  const written = await applyZipBackfill({ uid: "system", email: "system" });
  console.log(`\nWrote ${written} ZIPs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
