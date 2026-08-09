// Orgs purge — removes the Firestore data left behind by the retired
// Organizations feature.
//
// Usage:
//   npm run purge-orgs            # DRY RUN — reports only
//   npm run purge-orgs -- --commit   # actually deletes
//
// DESTRUCTIVE and irreversible. Take a Firestore export/backup first, and
// remember Zeffy is the source of truth for donor data.
//
// It:
//   1. Deletes every `orgs/{id}` document and its `encounters` subcollection.
//   2. Deletes audit-log entries for the removed `org` and `org_encounter`
//      resource types (these can contain donation amounts in their diffs).
//
// Idempotent: re-running on already-purged data is a no-op.
import { adminDb } from "@/lib/firebase/admin";

const COMMIT = process.argv.includes("--commit");

type Counts = {
  orgsDeleted: number;
  orgEncountersDeleted: number;
  auditEntriesDeleted: number;
};

async function purgeOrgs(counts: Counts): Promise<void> {
  const snap = await adminDb.collection("orgs").get();
  for (const doc of snap.docs) {
    const encounters = await doc.ref.collection("encounters").listDocuments();
    counts.orgEncountersDeleted += encounters.length;
    counts.orgsDeleted++;
    if (COMMIT) {
      await Promise.all(encounters.map((e) => e.delete()));
      await doc.ref.delete();
    }
  }
}

async function purgeOrgAuditEntries(counts: Counts): Promise<void> {
  const snap = await adminDb.collection("auditLog").get();
  for (const doc of snap.docs) {
    const type = doc.data().resourceType;
    if (type === "org" || type === "org_encounter") {
      counts.auditEntriesDeleted++;
      if (COMMIT) await doc.ref.delete();
    }
  }
}

async function main() {
  console.log(
    COMMIT
      ? "Purging orgs data (COMMIT — deleting)…"
      : "Purging orgs data (DRY RUN — no writes)…",
  );

  const counts: Counts = {
    orgsDeleted: 0,
    orgEncountersDeleted: 0,
    auditEntriesDeleted: 0,
  };

  await purgeOrgs(counts);
  await purgeOrgAuditEntries(counts);

  console.log("\nSummary:");
  console.log(`  Org documents deleted:     ${counts.orgsDeleted}`);
  console.log(`  Org encounters deleted:    ${counts.orgEncountersDeleted}`);
  console.log(`  Org audit entries deleted: ${counts.auditEntriesDeleted}`);
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
