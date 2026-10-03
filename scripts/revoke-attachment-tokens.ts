// Usage: npm run revoke-attachment-tokens [-- --dry-run]
//
// Veteran attachments used to be recorded with a Firebase download URL: a
// permanent, unauthenticated link to the file. Attachments are now only
// served through the session-checked /api/veterans/... route, so this strips
// the download token from every object under attachments/ (killing any URL
// already handed out) and clears the stored downloadUrl field.
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bucket = mediaBucket();

  const [files] = await bucket.getFiles({ prefix: "attachments/" });
  let stripped = 0;
  for (const file of files) {
    const [metadata] = await file.getMetadata();
    if (!metadata.metadata?.firebaseStorageDownloadTokens) continue;
    if (dryRun) {
      console.log(`[dry run] would revoke token on ${file.name}`);
    } else {
      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: null },
      });
      console.log(`Revoked token on ${file.name}`);
    }
    stripped++;
  }

  const docs = await adminDb.collection("attachments").get();
  let cleared = 0;
  for (const doc of docs.docs) {
    if (doc.data().downloadUrl === undefined) continue;
    if (!dryRun) {
      await doc.ref.update({ downloadUrl: FieldValue.delete() });
    }
    cleared++;
  }

  console.log(
    `${dryRun ? "[dry run] " : ""}${stripped} file tokens revoked, ${cleared} downloadUrl fields cleared.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
