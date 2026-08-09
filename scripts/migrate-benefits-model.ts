// Benefits-model migration.
//
// Usage:
//   npm run migrate-benefits-model            # DRY RUN — reports only
//   npm run migrate-benefits-model -- --commit   # actually writes
//
// Replaces the old projection model (rate codes + life expectancy + lifetime
// math) with two plain dollar figures: the monthly VA benefit BEFORE WTW
// (usually 0) and AFTER we connected them.
//
// For veterans that already had an `actualRateCode`, it recovers the monthly
// dollar amount from the `rateTable` collection (read first, deleted last) and
// seeds `monthlyBenefitAfter` from it so no won-case data is lost. Everyone
// else starts at 0/0 for staff to fill in.
//
// It then deletes the retired fields and the whole `rateTable` collection.
//
// Idempotent: once a veteran has been migrated (no `actualRateCode` left) its
// `monthlyBenefitAfter` is left untouched.
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const COMMIT = process.argv.includes("--commit");

const REMOVED_FIELDS = [
  "lifeExpectancyAtFound",
  "ageAtFound",
  "anticipatedRateCode",
  "actualRateCode",
] as const;

type Counts = {
  veteransSeen: number;
  afterSeededFromRate: number;
  fieldsCleared: number;
  rateTableDeleted: number;
};

/** code -> monthly dollar amount, read before we delete the table. */
async function loadRateTable(): Promise<Map<string, number>> {
  const snap = await adminDb.collection("rateTable").get();
  const map = new Map<string, number>();
  for (const doc of snap.docs) {
    const amount = doc.data().monthlyAmount;
    if (typeof amount === "number") map.set(doc.id, amount);
  }
  return map;
}

async function migrateVeterans(
  rates: Map<string, number>,
  counts: Counts,
): Promise<void> {
  const snap = await adminDb.collection("veterans").get();
  for (const doc of snap.docs) {
    counts.veteransSeen++;
    const data = doc.data();
    const update: Record<string, unknown> = {};

    if (typeof data.monthlyBenefitBefore !== "number") {
      update.monthlyBenefitBefore = 0;
    }

    // Seed "after" from the old actual rate code, if present and resolvable.
    if (typeof data.monthlyBenefitAfter !== "number") {
      const code =
        typeof data.actualRateCode === "string" ? data.actualRateCode : null;
      const fromRate = code ? rates.get(code) : undefined;
      update.monthlyBenefitAfter = fromRate ?? 0;
      if (fromRate) counts.afterSeededFromRate++;
    }

    let cleared = false;
    for (const field of REMOVED_FIELDS) {
      if (field in data) {
        update[field] = FieldValue.delete();
        cleared = true;
      }
    }
    if (cleared) counts.fieldsCleared++;

    if (COMMIT && Object.keys(update).length > 0) {
      await doc.ref.update(update);
    }
  }
}

async function deleteRateTable(counts: Counts): Promise<void> {
  const refs = await adminDb.collection("rateTable").listDocuments();
  counts.rateTableDeleted = refs.length;
  if (COMMIT) await Promise.all(refs.map((r) => r.delete()));
}

async function main() {
  console.log(
    COMMIT
      ? "Running benefits-model migration (COMMIT — writing changes)…"
      : "Running benefits-model migration (DRY RUN — no writes)…",
  );

  const rates = await loadRateTable();
  console.log(`Loaded ${rates.size} rate-table entries for lookup.`);

  const counts: Counts = {
    veteransSeen: 0,
    afterSeededFromRate: 0,
    fieldsCleared: 0,
    rateTableDeleted: 0,
  };

  await migrateVeterans(rates, counts);
  await deleteRateTable(counts);

  console.log("\nSummary:");
  console.log(`  Veterans scanned:              ${counts.veteransSeen}`);
  console.log(`  "After" seeded from rate code: ${counts.afterSeededFromRate}`);
  console.log(`  Veterans with fields cleared:  ${counts.fieldsCleared}`);
  console.log(`  rateTable docs deleted:        ${counts.rateTableDeleted}`);
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
