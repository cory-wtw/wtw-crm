/**
 * Firestore + Storage security rules, run against the emulators:
 *
 *   npm run test:rules
 *
 * The threat these pin down: Google sign-in creates a Firebase Auth user for
 * ANY Google account before the invite allowlist runs, so "signed in" must
 * never be enough to reach veteran data or files.
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-wtw-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("veterans/v1").set({ firstName: "Ann" });
    await ctx.firestore().doc("attachments/a1").set({ veteranId: "v1" });
    await ctx
      .storage()
      .ref("attachments/v1/dd214.pdf")
      .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const pdf = { contentType: "application/pdf" };
const bytes = () => new Uint8Array([37, 80, 68, 70]);

/** A put as a real Promise (UploadTask is only a thenable). */
function upload(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
  path: string,
  metadata: { contentType: string },
): Promise<unknown> {
  return Promise.resolve(ctx.storage().ref(path).put(bytes(), metadata));
}

// A Google account that was never invited: authenticated, no role claim.
const stranger = () => env.authenticatedContext("stranger");
const standard = () => env.authenticatedContext("staff", { role: "standard" });
const social = () => env.authenticatedContext("social", { role: "social" });
const admin = () => env.authenticatedContext("boss", { role: "admin" });

describe("firestore", () => {
  it("gives no client any access, whatever its role", async () => {
    for (const ctx of [stranger(), standard(), social(), admin()]) {
      const db = ctx.firestore();
      await assertFails(db.doc("veterans/v1").get());
      await assertFails(db.collection("attachments").get());
      await assertFails(db.collection("users").get());
      await assertFails(db.doc("veterans/v2").set({ firstName: "x" }));
    }
  });
});

describe("storage: attachments", () => {
  it("never lets a client read or list one", async () => {
    for (const ctx of [stranger(), standard(), admin()]) {
      const ref = ctx.storage().ref("attachments/v1/dd214.pdf");
      await assertFails(ref.getDownloadURL());
      await assertFails(ctx.storage().ref("attachments/v1").listAll());
    }
  });

  it("lets CRM staff upload a new PDF", async () => {
    await assertSucceeds(
      upload(standard(), "attachments/v1/new.pdf", pdf),
    );
  });

  it("refuses uninvited and social-only users", async () => {
    await assertFails(
      upload(stranger(), "attachments/v1/x.pdf", pdf),
    );
    await assertFails(
      upload(social(), "attachments/v1/y.pdf", pdf),
    );
  });

  it("refuses overwriting an existing file", async () => {
    await assertFails(
      upload(admin(), "attachments/v1/dd214.pdf", pdf),
    );
  });

  it("refuses non-PDFs and deletes", async () => {
    await assertFails(
      upload(standard(), "attachments/v1/x.html", { contentType: "text/html" }),
    );
    await assertFails(
      admin().storage().ref("attachments/v1/dd214.pdf").delete(),
    );
  });
});

describe("storage: media", () => {
  const jpeg = { contentType: "image/jpeg" };

  it("lets any role upload into its own folder", async () => {
    await assertSucceeds(
      upload(social(), "media/social/a.jpg", jpeg),
    );
    await assertSucceeds(
      upload(standard(), "media/staff/a.jpg", jpeg),
    );
  });

  it("refuses uninvited users and other people's folders", async () => {
    await assertFails(
      upload(stranger(), "media/stranger/a.jpg", jpeg),
    );
    await assertFails(
      upload(social(), "media/staff/b.jpg", jpeg),
    );
  });

  it("refuses anything but images and video", async () => {
    await assertFails(
      upload(social(), "media/social/x.pdf", { contentType: "application/pdf" }),
    );
  });
});
