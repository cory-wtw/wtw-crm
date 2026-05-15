import { describe, expect, it } from "vitest";
import { encounterInputSchema, encounterSchema } from "..";

describe("encounterInputSchema", () => {
  it("requires summary", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("requires occurredAt", () => {
    const result = encounterInputSchema.safeParse({
      summary: "Met at the shelter, took an intake form home.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the minimal valid encounter", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "Quick check-in.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated encounter", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      location: "Riverbend Shelter",
      summary: "Took an intake form home.",
      nextStep: "Follow up next Tuesday",
      nextStepDueAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts nextStepDueAt = null", () => {
    const result = encounterInputSchema.safeParse({
      occurredAt: new Date(),
      summary: "ok",
      nextStepDueAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("encounterSchema", () => {
  it("requires id, loggedBy, createdAt on top of input", () => {
    const result = encounterSchema.safeParse({
      occurredAt: new Date(),
      summary: "ok",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a stored encounter", () => {
    const result = encounterSchema.safeParse({
      id: "enc1",
      occurredAt: new Date(),
      loggedBy: "uid-cory",
      summary: "ok",
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});
