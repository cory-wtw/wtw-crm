/* eslint-disable */
/**
 * End-to-end check of the Claude connector against the Firestore emulator:
 * sign-in, proposing a whole call, approve-all, and the review findings
 * (double-apply, stale follow-ups, aging resources, key order, stuck claims,
 * refresh-token reuse, nothing sensitive stored).
 *
 *   firebase emulators:start --only firestore --project demo-test
 *   export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test FIRESTORE_EMULATOR_HOST=localhost:8080
 *   npm run build && npx next start -p 3456   # in another terminal
 *   npm run e2e:mcp
 *
 * Writes test data; never point it at a real project.
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST is not set — this only runs against the emulator.");
  process.exit(1);
}
// Outside Next there's no request: stub the two Next-only imports. (logAudit
// will warn that it has no session; that's expected here.)
const Module = require("module"); const o = Module._load;
Module._load = function (r: string, ...a: unknown[]) {
  if (r === "next/cache") return { revalidatePath() {} };
  if (r === "server-only") return {};
  return o.call(this, r, ...a);
};
const { createHash } = require("node:crypto");
const BASE = "http://localhost:3456";
let pass = 0, failN = 0;
const check = (name: string, ok: boolean, info?: unknown) => { ok ? pass++ : failN++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info !== undefined ? ` :: ${JSON.stringify(info).slice(0, 300)}` : ""}`); };
(async () => {
  const { adminDb } = await import("@/lib/firebase/admin");
  const { createAuthCode } = await import("@/lib/mcp/oauth");
  const cra = await import("@/lib/change-requests-apply");
  const admin = { uid: "admin1", email: "admin@wtw.org" };
  const now = new Date();
  await adminDb.collection("users").doc("admin1").set({ email: "admin@wtw.org", role: "admin", active: true, displayName: "Admin", createdAt: now });
  await adminDb.collection("veterans").doc("vet1").set({ firstName: "Maria", lastInitial: "G", preferredContact: "phone", phone: "4235550100", state: "TN", pipelineStage: "found", pipelineHistory: [], vsoIds: [], createdBy: "u", createdAt: now, updatedBy: "u", updatedAt: now });
  for (const [id, name, buckets, lv] of [["res1", "Hope House", ["housing"], now], ["res2", "Vet Jobs TN", ["work"], now], ["old", "Old Org", ["legal"], new Date("2025-01-01")]] as const)
    await adminDb.collection("resources").doc(id).set({ organizationName: name, buckets, geoScope: "national", geoStates: [], geoLocalities: [], accessMethod: "phone", accessValue: "800-555-0100", verificationStatus: "live", lastVerified: lv, createdBy: "u", createdAt: now, updatedBy: "u", updatedAt: now });
  await adminDb.collection("transactionCategories").doc("cat1").set({ name: "Veteran assistance", type: "expense", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 });

  // --- sign-in
  const reg = async (uris: string[]) => (await fetch(`${BASE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: uris }) })).json();
  check("redirect to other claude.ai page refused", !!(await reg(["https://claude.ai/evil"])).error);
  const client = await reg(["https://claude.ai/api/mcp/auth_callback"]);
  check("claude callback registers", !!client.client_id, client);
  const verifier = "v".repeat(50), challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await createAuthCode({ clientId: client.client_id, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: challenge, uid: "admin1", email: "admin@wtw.org" });
  const tokenReq = (body: Record<string, string>) => fetch(`${BASE}/api/oauth/token`, { method: "POST", body: new URLSearchParams(body) }).then((r) => r.json());
  let tok = await tokenReq({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" });
  check("token issued", !!tok.access_token, tok);
  let AT = tok.access_token;
  const call = async (name: string, args: unknown) => {
    const r = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${AT}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    if (r.status !== 200) return { status: r.status };
    const d = await r.json(); const t = d.result.content[0].text;
    try { return { isError: !!d.result.isError, ...JSON.parse(t) }; } catch { return { isError: !!d.result.isError, text: t }; }
  };

  // --- one call: new vet + intake + referral + note, approve all by id
  const G = "Call with Sam 10/27";
  const nv = await call("propose_veteran_create", { fields: { firstName: "Sam", phone: "4235550123", state: "TN" }, reason: "new", group: G });
  const pid = nv.request.useAsVeteranId;
  const intake = await call("propose_intake", { veteranId: pid, needs: ["housing", "work"], safeTonight: true, reason: "intake", group: G });
  check("intake returns short list", intake.shortList?.length === 2, intake);
  await call("propose_referral", { veteranId: pid, bucketsIdentified: ["housing", "work"], referrals: intake.shortList.map((c: any) => ({ resourceId: c.resourceId, rank: c.rank, score: c.score })), reason: "picked", group: G });
  await call("propose_contact_note", { veteranId: pid, summary: "First call", occurredAt: "2026-10-27", reason: "call", group: G });
  check("bad id refused", (await call("get_veteran", { veteranId: "vet1/encounters/x" })).isError === true);
  const shown = (await cra.listChangeRequests("pending")).filter((c) => c.groupLabel === G).map((c) => c.id);
  // Claude adds one more after the page loaded
  await call("propose_transaction_create", { fields: { date: "2026-10-27", type: "expense", amount: 45.1, categoryId: "cat1", vendor: "Kroger" }, reason: "receipt", group: G });
  const sneak = await cra.approveGroup(G, shown, admin);
  check("approve-all refuses when the call changed", sneak.approved === 0 && !!sneak.stoppedAt, sneak);
  const shown2 = (await cra.listChangeRequests("pending")).filter((c) => c.groupLabel === G).map((c) => c.id);
  const all = await cra.approveGroup(G, shown2, admin);
  check("approve-all with exact ids approves 5", all.approved === 5 && !all.stoppedAt, all);
  const sam = (await adminDb.collection("veterans").where("firstName", "==", "Sam").get()).docs[0];
  const encs = (await sam.ref.collection("encounters").get()).docs.map((d) => d.data());
  check("intake, referral, note on timeline", ["intake", "referral", "note"].every((t) => encs.some((e) => e.type === t)), encs.map((e) => e.type));
  check("new vet assignee is null like the form", sam.data().assigneeUid === null, sam.data().assigneeUid);
  const note = encs.find((e) => e.type === "note")!;
  check("bare date stored as noon UTC", note.occurredAt.toDate().toISOString() === "2026-10-27T12:00:00.000Z", note.occurredAt.toDate());
  check("one transaction", (await adminDb.collection("transactions").get()).size === 1);
  const refCr = (await cra.listChangeRequests("approved", 50)).find((c) => c.kind === "referral.create");
  check("packet text saved on the approval", typeof refCr?.result?.referralText === "string");

  // --- follow-up twice
  const vet = await call("get_veteran", { veteranId: sam.id });
  const refId = vet.openReferrals[0].referralEncounterId;
  check("follow-up naming a resource not in the referral refused", (await call("propose_follow_up", { veteranId: sam.id, referralEncounterId: refId, outcomes: [{ resourceId: "old", outcome: "unreachable" }], reason: "x" })).isError === true);
  const fu1 = await call("propose_follow_up", { veteranId: sam.id, referralEncounterId: refId, outcomes: [{ resourceId: "res1", outcome: "helped", winKind: "housedPermanent" }], reason: "2wk" });
  const fu2 = await call("propose_follow_up", { veteranId: sam.id, referralEncounterId: refId, outcomes: [{ resourceId: "res1", outcome: "helped", winKind: "housedPermanent" }], reason: "dup" });
  check("first follow-up approves", (await cra.decideChange(fu1.request.id, "approve", admin)).ok);
  const d2 = await cra.decideChange(fu2.request.id, "approve", admin);
  check("duplicate follow-up marked out of date", !d2.ok && d2.status === "stale", d2);
  const wins = (await sam.ref.get()).data()!.outcomes ?? [];
  check("win recorded once", wins.length === 1, wins.length);

  // --- aging resource edit doesn't re-verify
  const ar = await call("propose_resource_update", { resourceId: "old", changes: { contactPhone: "4235550111" }, reason: "new phone" });
  check("aging edit approves", (await cra.decideChange(ar.request.id, "approve", admin)).ok);
  const oldDoc = (await adminDb.collection("resources").doc("old").get()).data()!;
  check("aging resource not re-stamped", oldDoc.lastVerified.toDate().getFullYear() === 2025, oldDoc.lastVerified.toDate());

  // --- field-write approve with key order shuffled in storage
  const up = await call("propose_veteran_update", { veteranId: "vet1", changes: { city: "Cleveland", idStatus: "valid", pipelineStage: "connected" }, reason: "x" });
  const ref = adminDb.collection("changeRequests").doc(up.request.id);
  const ch = (await ref.get()).data()!.changes;
  const shuffled = Object.fromEntries(Object.keys(ch).reverse().map((k) => [k, { after: ch[k].after, before: ch[k].before }]));
  await ref.update({ changes: shuffled });
  check("approve works whatever order keys come back in", (await cra.decideChange(up.request.id, "approve", admin)).ok);

  // --- abandoned 'applying' claim can be retried
  const w = await call("propose_win", { veteranId: "vet1", kind: "job", achievedAt: "2026-10-20", amount: 2000, wtwRole: "helped", reason: "x" });
  await adminDb.collection("changeRequests").doc(w.request.id).update({ status: "applying", claimedAt: new Date(Date.now() - 10 * 60 * 1000) });
  check("abandoned claim retried", (await cra.decideChange(w.request.id, "approve", admin)).ok);
  const w2 = await call("propose_win", { veteranId: "vet1", kind: "snap", achievedAt: "2026-10-20", wtwRole: "led", reason: "x" });
  await adminDb.collection("changeRequests").doc(w2.request.id).update({ status: "applying", claimedAt: new Date() });
  check("fresh claim not stolen", !(await cra.decideChange(w2.request.id, "approve", admin)).ok);

  // --- needs checklist: add, then tick off by label; stale if it moved
  const c1 = await call("propose_checklist", { veteranId: "vet1", add: ["Bus pass", "State ID"], reason: "x" });
  check("checklist add approves", (await cra.decideChange(c1.request.id, "approve", admin)).ok, c1);
  const c2 = await call("propose_checklist", { veteranId: "vet1", done: ["bus pass"], reason: "x" });
  check("checklist tick approves", (await cra.decideChange(c2.request.id, "approve", admin)).ok, c2);
  const items = (await adminDb.collection("veterans").doc("vet1").get()).data()!.checklist as { label: string; done: boolean }[];
  check("checklist stored", items.length === 2 && items.find((i) => i.label === "Bus pass")!.done && !items.find((i) => i.label === "State ID")!.done, items);
  check("unknown item refused at propose", !!(await call("propose_checklist", { veteranId: "vet1", done: ["Phone"], reason: "x" })).isError);
  const c3 = await call("propose_checklist", { veteranId: "vet1", remove: ["State ID"], reason: "x" });
  await adminDb.collection("veterans").doc("vet1").update({ checklist: items.filter((i) => i.label !== "State ID") });
  const d3 = await cra.decideChange(c3.request.id, "approve", admin);
  check("checklist change on a moved list goes stale", !d3.ok && d3.status === "stale", d3);

  // --- refresh reuse revokes the grant
  const r1 = await tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: client.client_id });
  check("refresh rotates", !!r1.access_token, r1);
  const reuse = await tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: client.client_id });
  check("old refresh refused", !!reuse.error);
  AT = r1.access_token;
  check("reuse revoked the whole grant", (await call("search_veterans", {})).status === 401);
  const r2 = await tokenReq({ grant_type: "refresh_token", refresh_token: r1.refresh_token, client_id: client.client_id });
  check("new refresh also dead after reuse", !!r2.error, r2);

  // --- privacy
  const blob = JSON.stringify((await adminDb.collection("changeRequests").get()).docs.map((d) => d.data()));
  check("safeTonight never stored", !blob.includes("safeTonight"));
  console.log(`\n${pass} passed, ${failN} failed`);
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
