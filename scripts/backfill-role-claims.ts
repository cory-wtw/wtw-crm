// Usage: npm run backfill-role-claims [-- --dry-run]
//
// Copies each user's role from the users collection onto their Firebase Auth
// `role` custom claim, and strips the claim from deactivated users. Storage
// rules grant uploads by that claim alone, so a user created before claims
// were kept in sync can't upload until this has run.
//
// Users pick the new claim up on their next ID token refresh (within the
// hour); the upload forms force a refresh before uploading.
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { claimsForUser } from "@/lib/auth-provisioning";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const snap = await adminDb.collection("users").get();

  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const claims = claimsForUser({
      role: data.role ?? "standard",
      active: data.active ?? false,
    });
    const label = `${data.email ?? doc.id}: ${JSON.stringify(claims)}`;
    if (dryRun) {
      console.log(`[dry run] ${label}`);
      continue;
    }
    try {
      await adminAuth.setCustomUserClaims(doc.id, claims);
      updated++;
      console.log(label);
    } catch (err) {
      console.error(`Failed for ${data.email ?? doc.id}:`, err);
    }
  }

  console.log(
    dryRun
      ? `Dry run: ${snap.size} users would be updated.`
      : `Updated claims for ${updated} of ${snap.size} users.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
