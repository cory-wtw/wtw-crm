/**
 * Minimal RFC 4180 CSV reader/writer. Bank, Zeffy and QuickBooks exports all
 * quote fields with commas in them ("AMAZON.COM, INC") and some wrap lines
 * inside quoted memos, so a split(",") isn't enough. Pure, no I/O.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM — Excel-saved CSVs start with one and it ends up glued
  // to the first header name otherwise.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function escapeField(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // Guard against spreadsheet formula injection from vendor/memo text.
  // Only a plain number may start with "-"; "-1+cmd|…" is still a formula.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(escapeField).join(",")).join("\r\n") + "\r\n";
}

/** "$1,234.56", "(1,234.56)", "-1234.56", "1234.56 CR" → number, or null. */
export function parseMoney(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s*CR$/i.test(s)) s = s.replace(/\s*CR$/i, "");
  if (/\s*DR$/i.test(s)) {
    negative = !negative;
    s = s.replace(/\s*DR$/i, "");
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

/**
 * Bank exports use MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD, or occasionally
 * "Jan 5, 2026". Returns YYYY-MM-DD or null.
 */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return build(y, +m[1], +m[2]);
  }
  // "Jan 5, 2026" / "January 5 2026". Deliberately not Date.parse, which
  // turns junk like "1" into 2001-01-01 when the wrong column is mapped.
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return mo ? build(+m[3], mo, +m[2]) : null;
  }
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function build(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
