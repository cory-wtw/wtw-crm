import { createHash } from "node:crypto";
import { z } from "zod";
import type { TransactionType } from "@/lib/schemas/finance";

/**
 * SimpleFIN Bridge client (https://www.simplefin.org/protocol.html).
 *
 * Read-only bank data: a one-time setup token is claimed for an access URL
 * that carries its own Basic-auth credentials. That URL is the secret — it
 * lives server-side only and is never sent to a browser.
 */

/** Books are kept in Chattanooga time, so a 11pm swipe isn't tomorrow. */
const BOOKS_TZ = "America/New_York";

/** Bridge rejects long ranges; ask for history in windows this size. */
export const SYNC_WINDOW_DAYS = 60;

// ---------------------------------------------------------------------------
// Setup token → access URL

/**
 * Only ever talk to SimpleFIN. The setup token is an arbitrary URL the server
 * POSTs to, and the access URL it returns is fetched with credentials daily —
 * without this, a crafted token could point either at any host.
 */
export function isSimplefinHost(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "simplefin.org" || u.hostname.endsWith(".simplefin.org"))
    );
  } catch {
    return false;
  }
}

/** The setup token is a base64-encoded claim URL. */
export function decodeSetupToken(token: string): string {
  const trimmed = token.trim();
  let url: string;
  try {
    url = Buffer.from(trimmed, "base64").toString("utf8").trim();
  } catch {
    throw new Error("That doesn't look like a SimpleFIN setup token.");
  }
  if (!/^https:\/\/\S+$/.test(url)) {
    throw new Error("That doesn't look like a SimpleFIN setup token.");
  }
  if (!isSimplefinHost(url)) {
    throw new Error("That token isn't from SimpleFIN Bridge (simplefin.org).");
  }
  return url;
}

/** Claims a setup token. A token works once — a second claim fails. */
export async function claimAccessUrl(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const claimUrl = decodeSetupToken(token);
  const res = await fetchImpl(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
    redirect: "error",
  });
  if (res.status === 403) {
    throw new Error(
      "SimpleFIN says this token was already used or is invalid. Make a new one in SimpleFIN Bridge and paste that.",
    );
  }
  if (!res.ok) throw new Error(`SimpleFIN couldn't claim the token (HTTP ${res.status}).`);
  const accessUrl = (await res.text()).trim();
  parseAccessUrl(accessUrl); // throws if it isn't one
  return accessUrl;
}

/**
 * fetch() refuses URLs with credentials in them, so split the access URL
 * into a clean base and a Basic auth header.
 */
export function parseAccessUrl(accessUrl: string): { base: string; authorization: string } {
  let u: URL;
  try {
    u = new URL(accessUrl);
  } catch {
    throw new Error("SimpleFIN returned an access URL we can't read.");
  }
  if (u.protocol !== "https:" || !u.username) {
    throw new Error("SimpleFIN returned an access URL we can't read.");
  }
  if (!isSimplefinHost(accessUrl)) {
    throw new Error("The access URL doesn't point at SimpleFIN. Reconnect with a token from SimpleFIN Bridge.");
  }
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  u.username = "";
  u.password = "";
  const base = u.toString().replace(/\/+$/, "");
  const authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  return { base, authorization };
}

// ---------------------------------------------------------------------------
// Account Set

const numberish = z.union([z.string(), z.number()]).transform((v) => Number(v));

const sfTransactionSchema = z.object({
  id: z.string(),
  posted: z.number(),
  amount: numberish,
  description: z.string().default(""),
  payee: z.string().optional(),
  memo: z.string().optional(),
  transacted_at: z.number().optional(),
  pending: z.boolean().optional(),
});
export type SimplefinTransaction = z.infer<typeof sfTransactionSchema>;

const sfAccountSchema = z.object({
  id: z.string(),
  name: z.string().default("Account"),
  currency: z.string().default("USD"),
  balance: numberish,
  "balance-date": z.number().optional(),
  org: z
    .object({ name: z.string().optional(), domain: z.string().optional() })
    .partial()
    .default({}),
  transactions: z.array(sfTransactionSchema).default([]),
});
export type SimplefinAccount = z.infer<typeof sfAccountSchema>;

const accountSetSchema = z.object({
  errors: z.array(z.string()).default([]),
  // Newer servers also send structured errors, some tied to one account.
  errlist: z
    .array(
      z
        .object({
          msg: z.string().optional(),
          message: z.string().optional(),
          account_id: z.string().optional(),
        })
        .passthrough(),
    )
    .default([]),
  accounts: z.array(sfAccountSchema).default([]),
});

export type AccountSet = {
  /** Every error, from either field. */
  errors: string[];
  /** Accounts an error was specifically about. */
  erroredAccountIds: string[];
  accounts: SimplefinAccount[];
};

export function parseAccountSet(json: unknown): AccountSet {
  const parsed = accountSetSchema.safeParse(json);
  if (!parsed.success) throw new Error("SimpleFIN sent data we couldn't read.");
  const { errors, errlist, accounts } = parsed.data;
  const listed = errlist.map((e) => e.msg ?? e.message ?? "Connection error");
  return {
    errors: [...new Set([...errors, ...listed])],
    erroredAccountIds: errlist.map((e) => e.account_id).filter((id): id is string => !!id),
    accounts,
  };
}

export type FetchOptions = {
  /** Unix seconds, inclusive. */
  startDate?: number;
  /** Unix seconds, exclusive. */
  endDate?: number;
  accountIds?: readonly string[];
  /** Just names and balances — for the account picker. */
  balancesOnly?: boolean;
};

export function accountsUrl(base: string, opts: FetchOptions): string {
  const params = new URLSearchParams();
  if (opts.startDate != null) params.set("start-date", String(Math.floor(opts.startDate)));
  if (opts.endDate != null) params.set("end-date", String(Math.floor(opts.endDate)));
  if (opts.balancesOnly) params.set("balances-only", "1");
  for (const id of opts.accountIds ?? []) params.append("account", id);
  const qs = params.toString();
  return `${base}/accounts${qs ? `?${qs}` : ""}`;
}

export async function fetchAccountSet(
  accessUrl: string,
  opts: FetchOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountSet> {
  const { base, authorization } = parseAccessUrl(accessUrl);
  const res = await fetchImpl(accountsUrl(base, opts), {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
  });
  if (res.status === 403) {
    throw new Error("SimpleFIN refused the connection. It may have been revoked — reconnect the bank.");
  }
  if (res.status === 402) {
    throw new Error("SimpleFIN says the subscription needs payment.");
  }
  if (!res.ok) throw new Error(`SimpleFIN request failed (HTTP ${res.status}).`);
  return parseAccountSet(await res.json());
}

// ---------------------------------------------------------------------------
// Bank transaction → our row

/** Unix seconds → YYYY-MM-DD in the books' timezone. */
export function toBooksDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

export type BankRow = {
  /** Stable across syncs: the bank's own transaction id. */
  syncId: string;
  accountId: string;
  bankTxnId: string;
  date: string;
  /** What the bank says, payee first. */
  description: string;
  /** Always positive; direction is in `type`. */
  amount: number;
  type: TransactionType;
};

/** Pending rows change or vanish; only posted ones go in the books. */
export function toBankRow(account: Pick<SimplefinAccount, "id">, t: SimplefinTransaction): BankRow | null {
  if (t.pending || t.posted === 0) return null;
  if (!Number.isFinite(t.amount) || t.amount === 0) return null;
  const parts = [t.payee, t.description].map((s) => s?.trim()).filter(Boolean) as string[];
  // Payee is often a cleaner copy of the start of the description.
  const description =
    parts.length === 2 && parts[1].toUpperCase().includes(parts[0].toUpperCase())
      ? parts[1]
      : parts.join(" — ");
  return {
    syncId: bankSyncId(account.id, t.id),
    accountId: account.id,
    bankTxnId: t.id,
    date: toBooksDate(t.transacted_at ?? t.posted),
    description: (description || t.memo || "Bank transaction").slice(0, 500),
    amount: Math.round(Math.abs(t.amount) * 100) / 100,
    type: t.amount > 0 ? "income" : "expense",
  };
}

/**
 * Doc id for a synced transaction. The same bank transaction always maps to
 * the same id, so re-syncing an overlapping window can never double it.
 */
export function bankSyncId(accountId: string, bankTxnId: string): string {
  return `sf_${createHash("sha1").update(`${accountId}|${bankTxnId}`).digest("hex").slice(0, 24)}`;
}

/** [start, end) windows covering the range, oldest first. */
export function syncWindows(
  startUnix: number,
  endUnix: number,
  windowDays = SYNC_WINDOW_DAYS,
): { start: number; end: number }[] {
  const step = windowDays * 86400;
  const out: { start: number; end: number }[] = [];
  for (let s = startUnix; s < endUnix; s += step) {
    out.push({ start: s, end: Math.min(s + step, endUnix) });
  }
  return out;
}
