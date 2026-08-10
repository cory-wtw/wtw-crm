// Usage: npm run seed-rates
// Loads data/va-rates-2026.csv into the Firestore `rateTable` collection.
// Idempotent: re-running overwrites each row with the CSV's current values.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminDb } from "@/lib/firebase/admin";
import { parseCsv } from "@/lib/csv";
import { DEPENDENT_STATUSES, type DependentStatus } from "@/lib/schemas";

const DEPENDENT_LABEL_TO_VALUE: Record<string, DependentStatus> = {
  Alone: "alone",
  "With Spouse": "with_spouse",
  "With Spouse + Kids": "with_spouse_kids",
};

type RateRow = {
  rateCode: string;
  rating: string;
  dependentStatus: DependentStatus;
  monthlyAmount: number;
  rateYear: number;
};

function toRateRows(text: string): RateRow[] {
  return parseCsv(text).map((row) => {
    const dependentLabel = row["Dependent Status"];
    const dependentStatus = DEPENDENT_LABEL_TO_VALUE[dependentLabel];
    if (!dependentStatus || !DEPENDENT_STATUSES.includes(dependentStatus)) {
      throw new Error(
        `Unknown dependent status "${dependentLabel}" for ${row["Rate Code"]}`,
      );
    }
    return {
      rateCode: row["Rate Code"],
      rating: row["Rating"],
      dependentStatus,
      monthlyAmount: Number(row["Monthly Amount"]),
      rateYear: Number(row["Rate Year"]),
    };
  });
}

async function main() {
  const csvPath = resolve(process.cwd(), "data/va-rates-2026.csv");
  const rows = toRateRows(readFileSync(csvPath, "utf8"));
  console.log(`Seeding ${rows.length} rate codes from ${csvPath}…`);

  const batch = adminDb.batch();
  for (const row of rows) {
    batch.set(adminDb.collection("rateTable").doc(row.rateCode), row);
  }
  await batch.commit();

  console.log(`Wrote ${rows.length} rows to rateTable.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
