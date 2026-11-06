import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore, veteranDoc } from "@/lib/__tests__/fake-firestore";

// One live veteran (Sam) and one soft-deleted one (Ana). Every place that
// lists veterans should see Sam and never Ana.
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({
  get adminDb() {
    return db.current;
  },
}));
vi.mock("@/lib/firebase/session", () => ({
  getSession: async () => ({ uid: "admin1", email: "a@wtw.org", role: "admin" }),
}));
vi.mock("@/lib/db/finance", () => ({
  listTransactions: async () => [],
  listCategories: async () => [],
}));
vi.mock("@/lib/db/resources", () => ({
  listResources: async () => [],
  getResource: async () => null,
}));

const overdue = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  db.current = fakeFirestore({
    veterans: {
      live: veteranDoc({
        firstName: "Sam",
        vsoIds: ["vso1"],
        lastContactedAt: overdue,
        conciergeStatus: "referred",
        followUpDue: overdue,
      }),
      gone: veteranDoc({
        firstName: "Ana",
        pipelineStage: "won",
        vsoIds: ["vso1"],
        lastContactedAt: overdue,
        conciergeStatus: "referred",
        followUpDue: overdue,
        monthlyBenefitAfter: 2000,
        deletedAt: new Date("2026-11-05T15:00:00Z"),
        deletedBy: "admin1",
      }),
    },
  }).adminDb;
});

describe("veteran lists skip soft-deleted veterans", () => {
  it("listVeterans, by-VSO list and stage counts", async () => {
    const { listVeterans, listVeteransByVsoId, countVeteransByStage } =
      await import("./veterans");
    expect((await listVeterans()).map((v) => v.firstName)).toEqual(["Sam"]);
    expect((await listVeteransByVsoId("vso1")).map((v) => v.id)).toEqual(["live"]);
    expect(await countVeteransByStage()).toMatchObject({ found: 1, won: 0 });
  });

  it("getVeteran hides a deleted veteran unless asked", async () => {
    const { getVeteran } = await import("./veterans");
    expect(await getVeteran("gone")).toBeNull();
    const shown = await getVeteran("gone", { includeDeleted: true });
    expect(shown?.deletedBy).toBe("admin1");
    expect(shown?.deletedAt).toBeInstanceOf(Date);
  });

  it("listDeletedVeterans lists only the deleted", async () => {
    const { listDeletedVeterans } = await import("./veterans");
    expect((await listDeletedVeterans()).map((v) => v.id)).toEqual(["gone"]);
  });

  it("Outreach", async () => {
    const { default: OutreachPage } = await import("@/app/(app)/outreach/page");
    const tree = JSON.stringify(await OutreachPage());
    expect(tree).toContain("Sam");
    expect(tree).not.toContain("Ana");
  });

  it("MCP search_veterans and get_veteran", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { buildRosterMcpServer } = await import("@/lib/mcp/server");
    const server = buildRosterMcpServer("http://localhost", { uid: "u1", email: "u@wtw.org" });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const text = (r: unknown) =>
      (r as { content: { text: string }[] }).content[0].text;
    const all = text(await client.callTool({ name: "search_veterans", arguments: {} }));
    expect(all).toContain("Sam");
    expect(all).not.toContain("Ana");
    const byName = text(
      await client.callTool({ name: "search_veterans", arguments: { query: "ana" } }),
    );
    expect(JSON.parse(byName)).toEqual([]);
    const got = await client.callTool({ name: "get_veteran", arguments: { veteranId: "gone" } });
    expect(got.isError).toBe(true);
    await client.close();
  });

  it("public impact feed", async () => {
    const { GET } = await import("@/app/api/public/impact/route");
    const body = await (await GET()).json();
    expect(body.veteransFound).toBe(1);
    expect(body.claimsWon).toBe(0);
    expect(body.monthlyBenefits).toBe(0);
  });
});

describe("writes to a soft-deleted veteran are refused", () => {
  it("logging a win", async () => {
    const { logOutcome } = await import("@/lib/ops/outcome");
    const result = await logOutcome({ uid: "u1", email: "u@wtw.org" }, "gone", {
      kind: "job",
      achievedAt: "2026-11-05T12:00:00",
    });
    expect(result).toEqual({ ok: false, error: "Veteran not found." });
  });

  it("an MCP proposal", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { buildRosterMcpServer } = await import("@/lib/mcp/server");
    const server = buildRosterMcpServer("http://localhost", { uid: "u1", email: "u@wtw.org" });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const result = await client.callTool({
      name: "propose_contact_note",
      arguments: { veteranId: "gone", summary: "Called.", reason: "Logged a call." },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Veteran not found.");
    await client.close();
  });
});
