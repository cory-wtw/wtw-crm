import { describe, expect, it } from "vitest";
import { parseCsv, parseDate, parseMoney, toCsv } from "../csv";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const text = '﻿Date,Description,Amount\r\n01/02/2026,"AMAZON.COM, INC",-12.50\r\n01/03/2026,"He said ""hi""",5\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["Date", "Description", "Amount"],
      ["01/02/2026", "AMAZON.COM, INC", "-12.50"],
      ["01/03/2026", 'He said "hi"', "5"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([["a", "b"], ["line1\nline2", "x"]]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["a,b", 'q"q', "plain"], ["1", "", "x\ny"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("neutralises spreadsheet formulas but leaves negative numbers alone", () => {
    expect(toCsv([["=HYPERLINK(1)", "-12.50", "@x"]])).toBe("'=HYPERLINK(1),-12.50,'@x\r\n");
    expect(toCsv([["-2+3+cmd|' /C calc'!A0"]])).toBe("'-2+3+cmd|' /C calc'!A0\r\n");
  });
});

describe("parseMoney", () => {
  it.each([
    ["$1,234.56", 1234.56],
    ["-45.00", -45],
    ["(45.00)", -45],
    ["$-45.00", -45],
    ["12.5 CR", 12.5],
    ["12.5 DR", -12.5],
    [".99", 0.99],
  ])("%s → %s", (raw, expected) => {
    expect(parseMoney(raw)).toBe(expected);
  });

  it("returns null for blanks and junk", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-01-05", "2026-01-05"],
    ["1/5/2026", "2026-01-05"],
    ["01/05/26", "2026-01-05"],
    ["12-31-2025", "2025-12-31"],
    ["Jan 5, 2026", "2026-01-05"],
    ["September 30 2026", "2026-09-30"],
  ])("%s → %s", (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });

  it("rejects impossible dates", () => {
    expect(parseDate("02/30/2026")).toBeNull();
    expect(parseDate("13/01/2026")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("rejects numbers and words a mis-mapped column would supply", () => {
    expect(parseDate("1")).toBeNull();
    expect(parseDate("1042")).toBeNull();
    expect(parseDate("Check 1234")).toBeNull();
    expect(parseDate("Foo 5, 2026")).toBeNull();
  });
});
