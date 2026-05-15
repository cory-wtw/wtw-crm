// Usage: npm run make-admin -- <email>
// Grants the `admin` custom claim and mirrors the user into Firestore.
// The user must sign out and back in for the custom claim to take effect.
import { adminAuth, adminDb } from "@/lib/firebase/admin";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run make-admin -- <email>");
    process.exit(1);
  }

  const user = await adminAuth.getUserByEmail(email);
  await adminAuth.setCustomUserClaims(user.uid, { role: "admin" });
  await adminDb
    .collection("users")
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email: user.email ?? email,
        displayName: user.displayName ?? null,
        role: "admin",
        active: true,
        updatedAt: new Date(),
      },
      { merge: true },
    );

  console.log(`Granted admin role to ${email} (uid: ${user.uid}).`);
  console.log("Sign out and back in for the role to take effect.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
