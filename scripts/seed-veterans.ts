// Usage: npm run seed-veterans -- [path/to/csv]
// Defaults to data/airtable-veterans.csv. Idempotent only by ID — re-running
// creates duplicates. Run once, verify, then move on.
//
// Assignees are matched case-insensitively against Firebase Auth displayName.
// Unmatched assignees leave assigneeUid=null and print a warning so an admin
// can reassign in the UI later.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { mapAirtableRowToVeteran } from "@/lib/airtable-mapping";
import { parseCsv } from "@/lib/csv";

const SYSTEM_UID = "system-import";

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function buildAssigneeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if (u.displayName) {
        map.set(u.displayName.trim().toLowerCase(), u.uid);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return map;
}

async function main() {
  const csvPath = resolve(
    process.cwd(),
    process.argv[2] ?? "data/airtable-veterans.csv",
  );
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const assigneeMap = await buildAssigneeMap();
  console.log(
    `Matched ${assigneeMap.size} Firebase Auth users by displayName.`,
  );

  const now = new Date();
  const batch = adminDb.batch();
  let written = 0;

  for (const row of rows) {
    const result = mapAirtableRowToVeteran(row, {
      assigneeUidByDisplayName: assigneeMap,
      now,
      systemUid: SYSTEM_UID,
    });

    if (!result.ok) {
      console.warn(`Skipping row: ${result.error}`);
      continue;
    }

    for (const warning of result.warnings) {
      console.warn(`  ! [${warning.row}] ${warning.message}`);
    }

    const doc = dropUndefined({
      ...result.veteran,
      createdBy: SYSTEM_UID,
      createdAt: now,
      updatedBy: SYSTEM_UID,
      updatedAt: now,
    });

    const ref = adminDb.collection("veterans").doc();
    batch.set(ref, doc);
    written++;
    console.log(
      `  + ${result.veteran.name} (${result.veteran.pipelineStage})` +
        (result.veteran.assigneeUid ? ` → ${result.veteran.assigneeUid}` : ""),
    );
  }

  await batch.commit();
  console.log(`Done. Wrote ${written} veterans.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
