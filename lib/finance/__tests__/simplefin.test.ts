import { describe, expect, it, vi } from "vitest";
import {
  accountsUrl,
  bankSyncId,
  claimAccessUrl,
  decodeSetupToken,
  fetchAccountSet,
  parseAccessUrl,
  parseAccountSet,
  syncWindows,
  toBankRow,
  toBooksDate,
} from "../simplefin";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("decodeSetupToken", () => {
  it("decodes the claim URL", () => {
    expect(decodeSetupToken(` ${b64("https://bridge.example/claim/abc")}\n`)).toBe(
      "https://bridge.example/claim/abc",
    );
  });
  it("rejects junk", () => {
    expect(() => decodeSetupToken("not a token")).toThrow(/setup token/);
    expect(() => decodeSetupToken(b64("http://insecure.example/claim"))).toThrow();
  });
});

describe("parseAccessUrl", () => {
  it("splits credentials into a Basic header", () => {
    const { base, authorization } = parseAccessUrl("https://us%40r:p%3Ass@bridge.example/simplefin/");
    expect(base).toBe("https://bridge.example/simplefin");
    expect(authorization).toBe(`Basic ${b64("us@r:p:ss")}`);
  });
  it("needs credentials", () => {
    expect(() => parseAccessUrl("https://bridge.example/simplefin")).toThrow();
  });
});

describe("claimAccessUrl", () => {
  it("POSTs to the claim URL and returns the access URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("https://u:p@bridge.example/simplefin\n"));
    await expect(claimAccessUrl(b64("https://bridge.example/claim/x"), fetchImpl)).resolves.toBe(
      "https://u:p@bridge.example/simplefin",
    );
    expect(fetchImpl).toHaveBeenCalledWith("https://bridge.example/claim/x", expect.objectContaining({ method: "POST" }));
  });
  it("explains a used token", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    await expect(claimAccessUrl(b64("https://bridge.example/claim/x"), fetchImpl)).rejects.toThrow(/already used/);
  });
});

describe("accountsUrl", () => {
  it("builds the query", () => {
    expect(accountsUrl("https://b/simplefin", { startDate: 10.7, endDate: 20, accountIds: ["a", "b"] })).toBe(
      "https://b/simplefin/accounts?start-date=10&end-date=20&account=a&account=b",
    );
    expect(accountsUrl("https://b/simplefin", { balancesOnly: true })).toBe(
      "https://b/simplefin/accounts?balances-only=1",
    );
  });
});

describe("fetchAccountSet", () => {
  it("sends Basic auth without credentials in the URL", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ errors: [], accounts: [] }));
    await fetchAccountSet("https://u:p@b.example/simplefin", { balancesOnly: true }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://b.example/simplefin/accounts?balances-only=1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${b64("u:p")}`);
  });
});

describe("parseAccountSet", () => {
  it("reads string amounts and fills defaults", () => {
    const set = parseAccountSet({
      accounts: [
        {
          id: "acct1",
          name: "Checking",
          currency: "USD",
          balance: "1234.56",
          org: { name: "Found" },
          transactions: [{ id: "t1", posted: 1761900000, amount: "-12.50", description: "UBER TRIP" }],
        },
      ],
    });
    expect(set.errors).toEqual([]);
    expect(set.accounts[0].balance).toBe(1234.56);
    expect(set.accounts[0].transactions[0].amount).toBe(-12.5);
  });
});

describe("toBankRow", () => {
  const acct = { id: "acct1" };
  it("turns a debit into an expense", () => {
    const row = toBankRow(acct, { id: "t1", posted: 1761900000, amount: -12.5, description: "UBER *TRIP HELP.UBER.COM" });
    expect(row).toMatchObject({ amount: 12.5, type: "expense", accountId: "acct1", bankTxnId: "t1", description: "UBER *TRIP HELP.UBER.COM" });
    expect(row?.syncId).toBe(bankSyncId("acct1", "t1"));
  });
  it("turns a deposit into income", () => {
    expect(toBankRow(acct, { id: "t2", posted: 1761900000, amount: 500, description: "ZEFFY PAYOUT" })?.type).toBe("income");
  });
  it("skips pending and zero rows", () => {
    expect(toBankRow(acct, { id: "t3", posted: 1761900000, amount: -5, description: "X", pending: true })).toBeNull();
    expect(toBankRow(acct, { id: "t4", posted: 0, amount: -5, description: "X" })).toBeNull();
    expect(toBankRow(acct, { id: "t5", posted: 1761900000, amount: 0, description: "X" })).toBeNull();
  });
  it("doesn't repeat a payee the description already contains", () => {
    expect(toBankRow(acct, { id: "t6", posted: 1761900000, amount: -1, payee: "Uber", description: "UBER TRIP" })?.description).toBe("UBER TRIP");
    expect(toBankRow(acct, { id: "t7", posted: 1761900000, amount: -1, payee: "Kroger", description: "POS 1234" })?.description).toBe("Kroger — POS 1234");
  });
});

describe("toBooksDate", () => {
  it("uses Eastern time", () => {
    // 2026-11-01 02:30 UTC is still Oct 31 in Chattanooga.
    expect(toBooksDate(Date.UTC(2026, 10, 1, 2, 30) / 1000)).toBe("2026-10-31");
  });
});

describe("bankSyncId", () => {
  it("is stable and account-scoped", () => {
    expect(bankSyncId("a", "t")).toBe(bankSyncId("a", "t"));
    expect(bankSyncId("a", "t")).not.toBe(bankSyncId("b", "t"));
    expect(bankSyncId("a", "t")).toMatch(/^sf_[0-9a-f]{24}$/);
  });
});

describe("syncWindows", () => {
  it("covers the range in windows", () => {
    const day = 86400;
    expect(syncWindows(0, 130 * day, 60)).toEqual([
      { start: 0, end: 60 * day },
      { start: 60 * day, end: 120 * day },
      { start: 120 * day, end: 130 * day },
    ]);
    expect(syncWindows(5, 5)).toEqual([]);
  });
});
