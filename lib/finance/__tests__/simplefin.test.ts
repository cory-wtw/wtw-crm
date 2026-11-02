import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { pickAccounts, simplefinToCsv, type SimplefinResponse } from "../simplefin";

const data: SimplefinResponse = {
  accounts: [
    {
      id: "a1",
      name: "Business Checking",
      org: { name: "Found" },
      transactions: [
        { id: "t1", posted: 1761955200, amount: "-14.99", description: "CANVA, AUSTIN, TX" },
        { id: "t2", posted: 1762041600, amount: "1000.00", payee: "Cory Gold", description: "Zelle" },
        { id: "t3", posted: 1762128000, amount: "-5.00", description: "Pending", pending: true },
      ],
    },
    { id: "b1", name: "Personal", org: { name: "Ally Bank" }, transactions: [] },
  ],
};

describe("simplefin", () => {
  it("keeps only the Found account", () => {
    expect(pickAccounts(data).map((a) => a.id)).toEqual(["a1"]);
  });

  it("writes posted rows as bank CSV, newest first, payee preferred", () => {
    const rows = parseCsv(simplefinToCsv(pickAccounts(data)));
    expect(rows[0]).toEqual(["Date", "Description", "Amount", "Reference"]);
    expect(rows.slice(1)).toEqual([
      ["2025-11-02", "Cory Gold", "1000.00", "t2"],
      ["2025-11-01", "CANVA, AUSTIN, TX", "-14.99", "t1"],
    ]);
  });
});
