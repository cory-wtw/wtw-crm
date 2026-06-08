import { describe, expect, it } from "vitest";
import { encounterInputSchema, TRANSACTION_TYPES } from "..";

describe("encounterInputSchema money fields", () => {
  it("accepts an encounter without money fields (veteran case)", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "Met at the shelter.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an encounter with an amount and transaction type", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "Wired the grant.",
      amount: 5000,
      transactionType: "grant",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative amounts", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "ok",
      amount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts every transaction type", () => {
    for (const type of TRANSACTION_TYPES) {
      const result = encounterInputSchema.safeParse({
        occurredAt: new Date(),
        summary: "x",
        amount: 100,
        transactionType: type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown transaction types", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "x",
      amount: 100,
      transactionType: "tax-deductible-mystery",
    });
    expect(result.success).toBe(false);
  });
});
