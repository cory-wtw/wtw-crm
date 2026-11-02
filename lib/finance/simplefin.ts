/**
 * SimpleFIN Bridge (https://beta-bridge.simplefin.org) — the $15/year feed
 * that reads WTW's Found account. We turn its JSON into the same CSV the
 * bank import already understands, so pulled rows go through the usual
 * preview, vendor matching and duplicate check before anything is saved.
 *
 * The access URL carries its own credentials (https://user:pass@host/path)
 * and lives only in the SIMPLEFIN_ACCESS_URL secret.
 */

export type SimplefinTransaction = {
  id: string;
  posted: number;
  amount: string;
  description?: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
};

export type SimplefinAccount = {
  id: string;
  name: string;
  org?: { name?: string; domain?: string };
  transactions?: SimplefinTransaction[];
};

export type SimplefinResponse = {
  errors?: string[];
  accounts?: SimplefinAccount[];
};

const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Accounts whose institution or name matches (default: Found). */
export function pickAccounts(
  data: SimplefinResponse,
  match: RegExp = /found/i,
): SimplefinAccount[] {
  return (data.accounts ?? []).filter(
    (a) => match.test(a.org?.name ?? "") || match.test(a.org?.domain ?? "") || match.test(a.name),
  );
}

/** Posted transactions as a bank CSV: Date, Description, Amount, Reference. */
export function simplefinToCsv(accounts: SimplefinAccount[]): string {
  const lines = ["Date,Description,Amount,Reference"];
  const rows = accounts
    .flatMap((a) => a.transactions ?? [])
    .filter((t) => !t.pending && t.posted > 0)
    .sort((a, b) => b.posted - a.posted);
  for (const t of rows) {
    const date = new Date(t.posted * 1000).toISOString().slice(0, 10);
    const description = (t.payee || t.description || t.memo || "").trim();
    lines.push([date, csvCell(description), t.amount, csvCell(t.id)].join(","));
  }
  return lines.join("\n");
}

/** Fetches accounts with transactions posted on or after `since`. */
export async function fetchSimplefin(
  accessUrl: string,
  since: Date,
): Promise<SimplefinResponse> {
  const url = new URL(accessUrl);
  const auth = Buffer.from(
    `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
  ).toString("base64");
  url.username = "";
  url.password = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/accounts`;
  url.searchParams.set("start-date", String(Math.floor(since.getTime() / 1000)));
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SimpleFIN answered ${res.status}.`);
  return (await res.json()) as SimplefinResponse;
}
