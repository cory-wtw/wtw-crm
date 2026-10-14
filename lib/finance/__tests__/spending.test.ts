import { describe, expect, it } from "vitest";
import {
  NO_VENDOR,
  findRecurring,
  rawVendorKey,
  spendByMonth,
  summarizeVendors,
  vendorName,
  type SpendTransaction,
} from "../spending";

let n = 0;
const tx = (t: Partial<SpendTransaction>): SpendTransaction => ({
  id: `t${n++}`,
  date: "2026-09-01",
  vendor: "",
  amount: 10,
  type: "expense",
  categoryId: "office",
  ...t,
});

describe("vendor keys and names", () => {
  it("folds bank noise and falls back to the description", () => {
    expect(rawVendorKey({ vendor: "PostNet" })).toBe("POSTNET");
    expect(rawVendorKey({ vendor: "", description: "POSTNET TN112" })).toBe("POSTNET");
    expect(rawVendorKey({ vendor: "", description: "" })).toBe(NO_VENDOR);
    expect(vendorName({ vendor: "", description: "SQ *BLUEPRINT MEDIA, Dalton, GA" }, {})).toBe("Sq Blueprint Media Dalton");
  });

  it("applies aliases", () => {
    expect(vendorName({ vendor: "Regular Wages" }, { "REGULAR WAGES": "Payroll" })).toBe("Payroll");
  });
});

describe("summarizeVendors", () => {
  const rows = [
    tx({ vendor: "Gusto", amount: 400 }),
    tx({ vendor: "", description: "Return for GUSTO - FEE 1", amount: -400 }),
    tx({ vendor: "Gusto", amount: 255.2, date: "2026-10-02" }),
    tx({ vendor: "Regular Wages", amount: 2500, categoryId: "staff" }),
    tx({ vendor: "Social Security - employer tax", amount: 155, categoryId: "staff" }),
    tx({ vendor: "Zeffy", amount: 100, type: "income" }),
  ];

  it("nets refunds and ignores income", () => {
    const v = summarizeVendors(rows, {});
    expect(v.map((x) => x.name)).not.toContain("Zeffy");
    // Without an alias the refund's bank text ("GUSTO FEE") is its own key.
    expect(v.find((x) => x.name === "Gusto")?.total).toBe(655.2);
  });

  it("merges vendors aliased to the same name, case-insensitively", () => {
    const v = summarizeVendors(rows, {
      "REGULAR WAGES": "Payroll",
      "SOCIAL SECURITY": "payroll",
      "GUSTO FEE": "Gusto",
      GUSTO: "Gusto",
    });
    const payroll = v.find((x) => x.name.toLowerCase() === "payroll")!;
    expect(payroll.total).toBe(2655);
    expect(payroll.keys.sort()).toEqual(["REGULAR WAGES", "SOCIAL SECURITY"]);
    // The refund now nets against Gusto: 400 − 400 + 255.20.
    expect(v.find((x) => x.name === "Gusto")?.total).toBe(255.2);
    expect(v[0].name.toLowerCase()).toBe("payroll");
  });

  it("merges into a vendor that was never renamed", () => {
    const v = summarizeVendors(
      [tx({ vendor: "Amazon", amount: 50 }), tx({ vendor: "", description: "AMZN MKTP US*2K4", amount: 25 })],
      { "AMZN MKTP": "Amazon" },
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ name: "Amazon", total: 75 });
    expect(v[0].keys.sort()).toEqual(["AMAZON", "AMZN MKTP"]);
  });

  it("respects the date range", () => {
    expect(summarizeVendors(rows, {}, { from: "2026-10-01" }).map((x) => x.name)).toEqual(["Gusto"]);
  });
});

describe("findRecurring", () => {
  const monthly = (vendor: string, months: string[], amount: number) =>
    months.map((m) => tx({ vendor, date: `${m}-12`, amount }));

  it("finds subscriptions and labels stopped ones", () => {
    const rows = [
      ...monthly("Canva", ["2026-08", "2026-09", "2026-10"], 14.99),
      ...monthly("Verizon", ["2026-05", "2026-06", "2026-07"], 150),
      ...monthly("Walmart", ["2026-04", "2026-06", "2026-09"], 40), // not back to back
      tx({ vendor: "Lookouts", amount: 2850 }),
    ];
    const r = findRecurring(rows, {}, "2026-10-13");
    expect(r.map((x) => [x.name, x.active, x.monthly])).toEqual([
      ["Canva", true, 14.99],
      ["Verizon", false, 150],
    ]);
  });

  it("judges 'stopped' by each vendor's own billing rhythm", () => {
    const biweekly = ["2026-07-03", "2026-07-17", "2026-07-31", "2026-08-14", "2026-08-31"].map((date) =>
      tx({ vendor: "Regular Wages", date, amount: 2500 }),
    );
    const netlify = monthly("Netlify", ["2026-07", "2026-08", "2026-09"], 9.83);
    const r = findRecurring([...biweekly, ...netlify], {}, "2026-10-20");
    // Payroll quiet for 50 days against a 14-day rhythm: stopped.
    expect(r.find((x) => x.name === "Regular Wages")?.active).toBe(false);
    // Monthly bill 38 days after the last charge (a week late): still active.
    expect(r.find((x) => x.name === "Netlify")?.active).toBe(true);
    // …but two months quiet is stopped.
    expect(findRecurring(netlify, {}, "2026-11-20")[0].active).toBe(false);
  });

  it("folds refunds into the vendor they reverse", () => {
    expect(rawVendorKey({ vendor: "", description: "Return for GUSTO - FEE 505875" })).toBe(rawVendorKey({ vendor: "", description: "GUSTO - FEE 1" }));
  });

  it("uses the latest billing cycle, not an average", () => {
    const rows = [
      tx({ vendor: "Magic", date: "2026-07-16", amount: 1080 }),
      tx({ vendor: "Magic", date: "2026-08-27", amount: 1262 }),
      tx({ vendor: "Magic", date: "2026-09-22", amount: 880 }),
      // Two insurance policies billed two weeks apart both count.
      ...["2026-07-06", "2026-08-08", "2026-09-08"].map((date) => tx({ vendor: "NEXT", date, amount: 21.9 })),
      ...["2026-07-22", "2026-08-22", "2026-09-22"].map((date) => tx({ vendor: "NEXT", date, amount: 36.33 })),
    ];
    const r = findRecurring(rows, {}, "2026-10-13");
    expect(r.find((x) => x.name === "Magic")).toMatchObject({
      monthly: 880,
      estimated: 880,
      recentBills: [
        { date: "2026-09-22", amount: 880 },
        { date: "2026-08-27", amount: 1262 },
        { date: "2026-07-16", amount: 1080 },
      ],
    });
    expect(r.find((x) => x.name === "NEXT")?.monthly).toBe(58.23);
  });

  it("prefers an amount the admin set", () => {
    const rows = monthly("Magic", ["2026-07", "2026-08", "2026-09"], 1000);
    const [m] = findRecurring(rows, {}, "2026-10-13", { MAGIC: 440 });
    expect(m).toMatchObject({ monthly: 440, estimated: 1000, override: 440 });
    // Renaming the vendor keeps the amount: it's saved against the raw key.
    const [renamed] = findRecurring(rows, { MAGIC: "Hilda (Magic)" }, "2026-10-13", { MAGIC: 440 });
    expect(renamed).toMatchObject({ name: "Hilda (Magic)", monthly: 440 });
  });

  it("doesn't let a late credit rewrite an older bill", () => {
    const rows = [
      ...monthly("Gusto", ["2026-07", "2026-08", "2026-09"], 380),
      tx({ vendor: "Gusto", date: "2026-08-28", amount: -280 }),
    ];
    const [g] = findRecurring(rows, {}, "2026-10-01");
    expect(g.recentBills.map((b) => b.amount)).toEqual([380, 380, 380]);
  });

  it("doesn't show an active bill as $0 when a credit outweighs the month", () => {
    const rows = [
      ...monthly("Netlify", ["2026-07", "2026-08", "2026-09"], 20),
      tx({ vendor: "Netlify", date: "2026-09-20", amount: -25 }),
    ];
    expect(findRecurring(rows, {}, "2026-10-01")[0].monthly).toBe(20);
  });

  it("uses the last full month for biweekly billing", () => {
    const rows = ["2026-08-04", "2026-08-18", "2026-09-01", "2026-09-15", "2026-09-29", "2026-10-13"].map((date) =>
      tx({ vendor: "Loan", date, amount: 100 }),
    );
    // October has only one payment so far; September had three.
    expect(findRecurring(rows, {}, "2026-10-14")[0].monthly).toBe(300);
  });

  it("skips shopping that happens to repeat monthly", () => {
    const rows = [
      tx({ vendor: "Walmart", date: "2026-07-03", amount: 612.4 }),
      tx({ vendor: "Walmart", date: "2026-08-14", amount: 18.2 }),
      tx({ vendor: "Walmart", date: "2026-09-26", amount: 1.61 }),
      tx({ vendor: "Walmart", date: "2026-04-14", amount: 121.77 }),
      tx({ vendor: "Walmart", date: "2026-10-08", amount: -8.15 }), // refund-only month
      ...monthly("Magic", ["2026-07", "2026-08", "2026-09"], 1000).map((t, i) => ({ ...t, amount: [1080, 1262, 880][i] })),
    ];
    expect(findRecurring(rows, {}, "2026-10-13").map((r) => r.name)).toEqual(["Magic"]);
  });

  it("catches frequent new billing before it spans three months", () => {
    const rows = ["2026-08-04", "2026-08-19", "2026-09-01", "2026-09-15", "2026-09-29"].map((date) =>
      tx({ vendor: "Payroll Bridge", date, amount: 249.36 }),
    );
    const [loan] = findRecurring(rows, {}, "2026-10-13");
    expect(loan).toMatchObject({ name: "Payroll Bridge", active: true, lastDate: "2026-09-29" });
  });

  it("treats charges a day apart as one billing date", () => {
    // Two advances repaid on alternating days, every two weeks.
    const dates = ["2026-08-04", "2026-08-19", "2026-08-24", "2026-09-01", "2026-09-15", "2026-09-16", "2026-09-29", "2026-09-30"];
    const rows = dates.map((date) => tx({ vendor: "Payroll Bridge", date, amount: 240 }));
    expect(findRecurring(rows, {}, "2026-10-13")[0].active).toBe(true);
    expect(findRecurring(rows, {}, "2026-10-30")[0].active).toBe(false);
  });
});

describe("spendByMonth", () => {
  it("totals expenses per month and category", () => {
    const rows = [
      tx({ date: "2026-08-03", amount: 10, categoryId: "a" }),
      tx({ date: "2026-08-20", amount: 5.5, categoryId: "b" }),
      tx({ date: "2026-09-01", amount: 1, categoryId: "a" }),
      tx({ date: "2026-09-02", amount: 99, type: "income" }),
    ];
    expect(spendByMonth(rows)).toEqual([
      { month: "2026-08", total: 15.5, byCategory: { a: 10, b: 5.5 } },
      { month: "2026-09", total: 1, byCategory: { a: 1 } },
    ]);
  });
});
