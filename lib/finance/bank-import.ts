import { parseDate, parseMoney } from "./csv";
import type { TransactionType } from "@/lib/schemas/finance";

/**
 * Turns a bank (or Zeffy) CSV into candidate transactions and matches each
 * to a vendor we've seen before. Pure — the import screen runs it in the
 * browser for the preview, and the server action re-checks nothing but the
 * final, user-reviewed rows.
 */

export type ImportMode = "bank" | "zeffy";

export type ColumnMap = {
  date: number;
  description: number;
  /** One signed amount column… */
  amount: number;
  /** …or separate money-out / money-in columns. */
  debit: number;
  credit: number;
  donorFirst: number;
  donorLast: number;
  campaign: number;
  reference: number;
  status: number;
};

export const NO_COLUMN = -1;

const PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  date: [/^(posted|posting|transaction|payment)?\s*date$/i, /date/i],
  description: [/^description$/i, /payee|merchant|description|details|memo|name/i],
  amount: [/^(total\s*)?amount$/i, /amount/i],
  debit: [/debit|withdrawal|money out|outflow/i],
  credit: [/credit|deposit|money in|inflow/i],
  donorFirst: [/first\s*name/i],
  donorLast: [/last\s*name/i],
  campaign: [/campaign|form\s*(title|name)|^form$/i],
  reference: [/(payment|transaction|order)\s*(id|number|#)|^id$|reference/i],
  status: [/status/i],
};

export function detectColumns(headers: readonly string[], mode: ImportMode): ColumnMap {
  const used = new Set<number>();
  const find = (key: keyof ColumnMap): number => {
    for (const re of PATTERNS[key]) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(h.trim()));
      if (i !== NO_COLUMN) {
        used.add(i);
        return i;
      }
    }
    return NO_COLUMN;
  };
  // Order matters: claim the specific columns before the greedy ones
  // ("First Name" would otherwise satisfy description's /name/).
  const date = find("date");
  const amount = find("amount");
  const debit = amount === NO_COLUMN ? find("debit") : NO_COLUMN;
  const credit = amount === NO_COLUMN ? find("credit") : NO_COLUMN;
  const donorFirst = mode === "zeffy" ? find("donorFirst") : NO_COLUMN;
  const donorLast = mode === "zeffy" ? find("donorLast") : NO_COLUMN;
  const campaign = mode === "zeffy" ? find("campaign") : NO_COLUMN;
  const reference = find("reference");
  const status = find("status");
  const description = find("description");
  return { date, description, amount, debit, credit, donorFirst, donorLast, campaign, reference, status };
}

export type ParsedRow = {
  line: number;
  date: string;
  description: string;
  /** Positive, except a Zeffy refund, which stays negative income. */
  amount: number;
  type: TransactionType;
  donorName?: string;
  campaign?: string;
  reference?: string;
};

export type RowError = { line: number; message: string };

export function extractRows(
  rows: readonly (readonly string[])[],
  map: ColumnMap,
  opts: { mode: ImportMode; flipSigns?: boolean },
): { rows: ParsedRow[]; errors: RowError[]; skipped: RowError[] } {
  const out: ParsedRow[] = [];
  const errors: RowError[] = [];
  const skipped: RowError[] = [];
  const cell = (r: readonly string[], i: number) =>
    i === NO_COLUMN ? "" : (r[i] ?? "").trim();

  // rows[0] is the header; line numbers are 1-based like a spreadsheet.
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const date = parseDate(cell(r, map.date));
    if (!date) {
      errors.push({ line, message: `No readable date ("${cell(r, map.date)}")` });
      return;
    }

    let signed: number | null;
    if (map.amount !== NO_COLUMN) {
      signed = parseMoney(cell(r, map.amount));
    } else {
      const debit = parseMoney(cell(r, map.debit));
      const credit = parseMoney(cell(r, map.credit));
      signed =
        debit == null && credit == null
          ? null
          : (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0);
    }
    if (signed == null) {
      errors.push({ line, message: "No readable amount" });
      return;
    }
    if (signed === 0) {
      skipped.push({ line, message: "Zero amount" });
      return;
    }

    const status = cell(r, map.status);
    if (/fail|declin|cancel|pending|void/i.test(status)) {
      skipped.push({ line, message: `Status "${status}"` });
      return;
    }

    if (opts.mode === "zeffy" && signed > 0 && /refund/i.test(status)) {
      // The gift came in and went back out. If Zeffy also lists a separate
      // negative refund row, that row is kept and flagged in the preview.
      skipped.push({ line, message: `Status "${status}"` });
      return;
    }

    if (opts.mode === "zeffy") {
      const donorName = [cell(r, map.donorFirst), cell(r, map.donorLast)]
        .filter(Boolean)
        .join(" ");
      const campaign = cell(r, map.campaign) || undefined;
      out.push({
        line,
        date,
        description: cell(r, map.description) || campaign || "Zeffy donation",
        // A refund in Zeffy's export is a negative row; keep it as negative
        // income so the period total nets out.
        amount: signed,
        type: "income",
        donorName: donorName || undefined,
        campaign,
        reference: cell(r, map.reference) || undefined,
      });
      return;
    }

    const flowIn = opts.flipSigns ? signed < 0 : signed > 0;
    out.push({
      line,
      date,
      description: cell(r, map.description),
      amount: Math.abs(signed),
      type: flowIn ? "income" : "expense",
      reference: cell(r, map.reference) || undefined,
    });
  });

  return { rows: out, errors, skipped };
}

// ---------------------------------------------------------------------------
// Vendor matching

const NOISE = new Set([
  "POS", "PURCHASE", "DEBIT", "CREDIT", "CARD", "CHECKCARD", "ACH", "RECURRING",
  "ONLINE", "PAYMENT", "PMT", "WEB", "ID", "PPD", "CCD", "WITHDRAWAL", "DEPOSIT",
  "TRANSFER", "XFER", "VISA", "MASTERCARD", "DBT", "PREAUTHORIZED", "AUTHORIZED",
  "ON", "INC", "LLC", "CO", "COM", "WWW", "HTTPS", "HTTP", "THE",
  // trailing US state codes are noise on nearly every card swipe
  "TN", "GA", "AL", "CA", "NY", "WA", "TX", "FL", "NC", "SC", "KY", "VA",
]);

/** Uppercase words with numbers, punctuation and bank boilerplate removed. */
export function normalizeVendorText(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t) && !/\d/.test(t))
    .join(" ");
}

export type KnownVendor = {
  vendor: string;
  description?: string;
  categoryId: string;
  type: TransactionType;
};

export type VendorIndex = {
  byDescription: Map<string, KnownVendor>;
  byVendor: { key: string; known: KnownVendor }[];
};

/** `known` should be newest-first so the most recent categorisation wins. */
export function buildVendorIndex(known: readonly KnownVendor[]): VendorIndex {
  const byDescription = new Map<string, KnownVendor>();
  const vendorMap = new Map<string, KnownVendor>();
  for (const k of known) {
    if (k.description) {
      const d = normalizeVendorText(k.description);
      if (d && !byDescription.has(d)) byDescription.set(d, k);
    }
    const v = normalizeVendorText(k.vendor);
    if (v.length >= 3 && !vendorMap.has(v)) vendorMap.set(v, k);
  }
  const byVendor = [...vendorMap.entries()]
    .map(([key, k]) => ({ key, known: k }))
    // Longest first so "AMAZON WEB SERVICES" beats "AMAZON".
    .sort((a, b) => b.key.length - a.key.length);
  return { byDescription, byVendor };
}

export function matchVendor(
  description: string,
  type: TransactionType,
  index: VendorIndex,
): KnownVendor | null {
  const norm = normalizeVendorText(description);
  if (!norm) return null;
  const exact = index.byDescription.get(norm);
  if (exact && exact.type === type) return exact;
  const padded = ` ${norm} `;
  for (const { key, known } of index.byVendor) {
    if (known.type === type && padded.includes(` ${key} `)) return known;
  }
  return null;
}

/** "SQ *JOES COFFEE 0423 CHATTANOOGA TN" → "Sq Joes Coffee Chattanooga". */
export function suggestVendorName(description: string): string {
  return normalizeVendorText(description)
    .split(" ")
    .slice(0, 4)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Zeffy pays out to the bank in lump sums. If Zeffy donations are imported
 * individually, the payout deposit is the same money a second time.
 */
export function isZeffyPayout(row: Pick<ParsedRow, "description" | "type">): boolean {
  return row.type === "income" && /zeffy/i.test(row.description);
}

/** Stable identity for de-duplicating re-imports of overlapping statements. */
export function importIdentity(
  mode: ImportMode,
  row: Pick<ParsedRow, "date" | "amount" | "type" | "description" | "reference" | "donorName">,
): string {
  if (row.reference) return `${mode}|ref|${row.reference}`;
  return [
    mode,
    row.date,
    row.type,
    Math.round(row.amount * 100),
    normalizeVendorText(row.description),
    row.donorName ?? "",
  ].join("|");
}
