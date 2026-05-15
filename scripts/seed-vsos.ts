// Usage: npm run seed-vsos -- [path/to/csv]
// Defaults to data/airtable-vsos.csv. Not idempotent — re-running creates
// duplicates. Run once, verify, then move on.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminDb } from "@/lib/firebase/admin";
import { mapAirtableRowToVso } from "@/lib/airtable-vso-mapping";
import { parseCsv } from "@/lib/csv";

const SYSTEM_UID = "system-import";

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function main() {
  const csvPath = resolve(
    process.cwd(),
    process.argv[2] ?? "data/airtable-vsos.csv",
  );
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const now = new Date();
  const batch = adminDb.batch();
  let written = 0;

  for (const row of rows) {
    const result = mapAirtableRowToVso(row);
    if (!result.ok) {
      console.warn(`Skipping row: ${result.error}`);
      continue;
    }
    for (const warning of result.warnings) {
      console.warn(`  ! [${warning.row}] ${warning.message}`);
    }

    const doc = dropUndefined({
      ...result.vso,
      referralsMade: 0,
      createdBy: SYSTEM_UID,
      createdAt: now,
      updatedBy: SYSTEM_UID,
      updatedAt: now,
    });

    const ref = adminDb.collection("vsos").doc();
    batch.set(ref, doc);
    written++;
    console.log(
      `  + ${result.vso.fullName} (${result.vso.partnershipStatus})`,
    );
  }

  await batch.commit();
  console.log(`Done. Wrote ${written} VSOs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
