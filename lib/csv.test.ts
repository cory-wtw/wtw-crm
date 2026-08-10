import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseCsvLine,
  parseCurrency,
  parseDateMDY,
  parseIntOrNull,
} from "./csv";

describe("parseCsvLine", () => {
  it("splits on commas outside quotes", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps commas that appear inside quoted values", () => {
    expect(
      parseCsvLine('Smith,"Last, First","Notes, with commas"'),
    ).toEqual(["Smith", "Last, First", "Notes, with commas"]);
  });

  it("handles trailing empties", () => {
    expect(parseCsvLine("a,b,")).toEqual(["a", "b", ""]);
  });

  it("treats doubled quotes as an escaped quote inside a quoted value", () => {
    expect(parseCsvLine('"He said ""hi""",x')).toEqual([
      'He said "hi"',
      "x",
    ]);
  });
});

describe("parseCsv", () => {
  it("parses headers and rows into row objects", () => {
    const text = "Name,Phone\nAlice,123\nBob,456";
    expect(parseCsv(text)).toEqual([
      { Name: "Alice", Phone: "123" },
      { Name: "Bob", Phone: "456" },
    ]);
  });

  it("survives CRLF line endings", () => {
    const text = "Name,Phone\r\nAlice,123\r\nBob,456";
    expect(parseCsv(text)).toHaveLength(2);
  });

  it("returns empty when there are no data rows", () => {
    expect(parseCsv("Name,Phone\n")).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("trims whitespace around cell values", () => {
    expect(parseCsv("a, b\n c , d ")).toEqual([{ a: "c", b: "d" }]);
  });

  it("fills missing trailing columns with empty strings", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([
      { a: "1", b: "2", c: "" },
    ]);
  });
});

describe("parseDateMDY", () => {
  it("parses M/D/YYYY", () => {
    const d = parseDateMDY("1/1/2020");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2020);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(1);
  });

  it("parses MM/DD/YYYY", () => {
    const d = parseDateMDY("12/31/2025");
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(11);
    expect(d!.getDate()).toBe(31);
  });

  it("returns null for empty string", () => {
    expect(parseDateMDY("")).toBeNull();
  });

  it("returns null for malformed dates", () => {
    expect(parseDateMDY("2020-01-01")).toBeNull();
    expect(parseDateMDY("January 1 2020")).toBeNull();
    expect(parseDateMDY("13/1/2020")).toBeNull();
    expect(parseDateMDY("1/40/2020")).toBeNull();
  });
});

describe("parseCurrency", () => {
  it("strips dollar signs and commas", () => {
    expect(parseCurrency("$1,234.56")).toBe(1234.56);
  });

  it("handles plain numbers", () => {
    expect(parseCurrency("4928.81")).toBe(4928.81);
  });

  it("returns null on empty", () => {
    expect(parseCurrency("")).toBeNull();
    expect(parseCurrency("$")).toBeNull();
  });

  it("returns null on non-numeric", () => {
    expect(parseCurrency("abc")).toBeNull();
  });

  it("handles zero", () => {
    expect(parseCurrency("$0.00")).toBe(0);
  });
});

describe("parseIntOrNull", () => {
  it("parses integers", () => {
    expect(parseIntOrNull("42")).toBe(42);
  });

  it("truncates decimals", () => {
    expect(parseIntOrNull("3.7")).toBe(3);
  });

  it("returns null on empty", () => {
    expect(parseIntOrNull("")).toBeNull();
  });

  it("returns null on non-numeric", () => {
    expect(parseIntOrNull("foo")).toBeNull();
  });
});
