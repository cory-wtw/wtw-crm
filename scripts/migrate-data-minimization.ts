// Data-minimization migration.
//
// Usage:
//   npm run migrate-data-minimization           # DRY RUN — reports only
//   npm run migrate-data-minimization -- --commit   # actually writes
//
// This is DESTRUCTIVE and irreversible. Take a Firestore export/backup first.
// It:
//   1. Reduces each veteran to the minimized shape:
//        - splits `name` into `firstName` + `lastInitial` (full last name lost)
//        - sets `preferredContact` ("email" if only an email is on file, else
//          "phone")
//        - deletes preferredName, yearlyIncome, householdSize, dependentStatus,
//          branch, dischargeStatus, serviceFrom, serviceTo, housingStatus, notes
//   2. Deletes every intake document under veterans/{id}/intakes.
//   3. Scrubs the audit log: deletes intake audit entries and redacts the
//      removed fields' before/after values (old full names, phones, incomes,
//      etc.) from all remaining diffs.
//
// Idempotent: re-running is safe (already-split names and already-deleted
// fields are left alone).
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { splitFullName } from "@/lib/name";

const COMMIT = process.argv.includes("--commit");

// Veteran fields removed by the minimization. Also the set redacted from
// audit-log diffs (plus `name` and `phone`, added below).
const REMOVED_VETERAN_FIELDS = [
  "preferredName",
  "yearlyIncome",
  "householdSize",
  "dependentStatus",
  "branch",
  "dischargeStatus",
  "serviceFrom",
  "serviceTo",
  "housingStatus",
  "notes",
] as const;

// Values to strip out of historical audit diffs. `name` and `phone` are
// included because the question specifically called out old full names and
// phone numbers as PII to purge from history.
const REDACTED_AUDIT_FIELDS = new Set<string>([
  ...REMOVED_VETERAN_FIELDS,
  "name",
  "phone",
]);
const REDACTED = "[redacted]";

type Counts = {
  veteransSeen: number;
  veteransSplit: number;
  veteransFieldsCleared: number;
  intakesDeleted: number;
  auditIntakeDeleted: number;
  auditDiffsRedacted: number;
};

async function migrateVeterans(counts: Counts): Promise<void> {
  const snap = await adminDb.collection("veterans").get();
  for (const doc of snap.docs) {
    counts.veteransSeen++;
    const data = doc.data();

    const update: Record<string, unknown> = {};

    // 1a. Split name → firstName + lastInitial (only if not already done).
    const hasFirstName =
      typeof data.firstName === "string" && data.firstName.length > 0;
    if (!hasFirstName) {
      const source = typeof data.name === "string" ? data.name : "";
      const { firstName, lastInitial } = splitFullName(source);
      update.firstName = firstName;
      update.lastInitial = lastInitial;
      counts.veteransSplit++;
    }
    if ("name" in data) update.name = FieldValue.delete();

    // 1b. Preferred contact channel. Existing rows only ever had a phone, but
    // handle an email-only row just in case.
    if (typeof data.preferredContact !== "string") {
      const hasPhone =
        typeof data.phone === "string" && data.phone.trim().length > 0;
      const hasEmail =
        typeof data.email === "string" && data.email.trim().length > 0;
      update.preferredContact = !hasPhone && hasEmail ? "email" : "phone";
    }

    // 1c. Drop the removed fields.
    let clearedAny = false;
    for (const field of REMOVED_VETERAN_FIELDS) {
      if (field in data) {
        update[field] = FieldValue.delete();
        clearedAny = true;
      }
    }
    if (clearedAny) counts.veteransFieldsCleared++;

    // 2. Delete intake subcollection docs.
    const intakeRefs = await doc.ref.collection("intakes").listDocuments();
    counts.intakesDeleted += intakeRefs.length;

    if (COMMIT) {
      if (Object.keys(update).length > 0) await doc.ref.update(update);
      await Promise.all(intakeRefs.map((r) => r.delete()));
    }
  }
}

async function scrubAuditLog(counts: Counts): Promise<void> {
  const snap = await adminDb.collection("auditLog").get();
  for (const doc of snap.docs) {
    const data = doc.data();

    // Delete audit entries that reference the retired intake resource type.
    if (data.resourceType === "intake") {
      counts.auditIntakeDeleted++;
      if (COMMIT) await doc.ref.delete();
      continue;
    }

    // Redact removed-field values from the diff.
    const diff = data.diff as
      | Record<string, { before: unknown; after: unknown }>
      | undefined;
    if (!diff) continue;

    let changed = false;
    const next: Record<string, { before: unknown; after: unknown }> = {};
    for (const [field, entry] of Object.entries(diff)) {
      if (REDACTED_AUDIT_FIELDS.has(field)) {
        next[field] = { before: REDACTED, after: REDACTED };
        changed = true;
      } else {
        next[field] = entry;
      }
    }
    if (changed) {
      counts.auditDiffsRedacted++;
      if (COMMIT) await doc.ref.update({ diff: next });
    }
  }
}

async function main() {
  console.log(
    COMMIT
      ? "Running data-minimization migration (COMMIT — writing changes)…"
      : "Running data-minimization migration (DRY RUN — no writes)…",
  );

  const counts: Counts = {
    veteransSeen: 0,
    veteransSplit: 0,
    veteransFieldsCleared: 0,
    intakesDeleted: 0,
    auditIntakeDeleted: 0,
    auditDiffsRedacted: 0,
  };

  await migrateVeterans(counts);
  await scrubAuditLog(counts);

  console.log("\nSummary:");
  console.log(`  Veterans scanned:            ${counts.veteransSeen}`);
  console.log(`  Names split (first+initial): ${counts.veteransSplit}`);
  console.log(`  Veterans with fields cleared:${counts.veteransFieldsCleared}`);
  console.log(`  Intake docs deleted:         ${counts.intakesDeleted}`);
  console.log(`  Audit intake entries deleted:${counts.auditIntakeDeleted}`);
  console.log(`  Audit diffs redacted:        ${counts.auditDiffsRedacted}`);
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
