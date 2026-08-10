// Benefit-ratings migration.
//
// Usage:
//   npm run migrate-benefit-ratings            # DRY RUN — reports only
//   npm run migrate-benefit-ratings -- --commit   # actually writes
//
// Moves the benefit model to rating % + dependency category (dollars are
// computed from the current VA rate table at read time). For veterans that
// still carry an old `actualRateCode` (e.g. "70-S", "100-SMCS-SK"), it
// recovers `ratingAfter` and `dependentStatus` from that code so won cases
// aren't lost. `ratingBefore` defaults to 0 (pre-WTW).
//
// It also clears the retired fields from earlier benefit models
// (anticipatedRateCode, actualRateCode, lifeExpectancyAtFound, ageAtFound,
// monthlyBenefitBefore, monthlyBenefitAfter). It does NOT touch the rateTable.
//
// Idempotent: once a veteran has a numeric `ratingAfter` it is left alone.
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const COMMIT = process.argv.includes("--commit");

const REMOVED_FIELDS = [
  "anticipatedRateCode",
  "actualRateCode",
  "lifeExpectancyAtFound",
  "ageAtFound",
  "monthlyBenefitBefore",
  "monthlyBenefitAfter",
] as const;

type Parsed = { rating: number; dependentStatus: string };

/**
 * Parse a legacy rate code like "70-S" or "100-SMCS-SK" into a rating % and
 * dependency category. Rating is the leading integer; dependency comes from
 * the trailing segment (A / S / SK).
 */
function parseRateCode(code: string): Parsed | null {
  const ratingMatch = code.match(/^(\d{1,3})/);
  if (!ratingMatch) return null;
  const rating = Math.min(100, parseInt(ratingMatch[1], 10));
  const last = code.split("-").pop()?.toUpperCase() ?? "";
  const dependentStatus =
    last === "SK"
      ? "with_spouse_kids"
      : last === "S"
        ? "with_spouse"
        : "alone";
  return { rating, dependentStatus };
}

type Counts = {
  seen: number;
  recoveredFromRateCode: number;
  fieldsCleared: number;
};

async function main() {
  console.log(
    COMMIT
      ? "Running benefit-ratings migration (COMMIT — writing changes)…"
      : "Running benefit-ratings migration (DRY RUN — no writes)…",
  );

  const counts: Counts = {
    seen: 0,
    recoveredFromRateCode: 0,
    fieldsCleared: 0,
  };

  const snap = await adminDb.collection("veterans").get();
  for (const doc of snap.docs) {
    counts.seen++;
    const data = doc.data();
    const update: Record<string, unknown> = {};

    const alreadyMigrated = typeof data.ratingAfter === "number";
    if (!alreadyMigrated) {
      const code =
        typeof data.actualRateCode === "string" ? data.actualRateCode : null;
      const parsed = code ? parseRateCode(code) : null;
      if (parsed) {
        update.ratingAfter = parsed.rating;
        update.dependentStatus = parsed.dependentStatus;
        counts.recoveredFromRateCode++;
      } else {
        update.ratingAfter = 0;
        if (typeof data.dependentStatus !== "string") {
          update.dependentStatus = "alone";
        }
      }
      if (typeof data.ratingBefore !== "number") update.ratingBefore = 0;
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

  console.log("\nSummary:");
  console.log(`  Veterans scanned:                ${counts.seen}`);
  console.log(`  Recovered rating from rate code: ${counts.recoveredFromRateCode}`);
  console.log(`  Veterans with fields cleared:    ${counts.fieldsCleared}`);
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
