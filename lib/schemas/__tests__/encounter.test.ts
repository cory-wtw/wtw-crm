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

describe("referral encounters", () => {
  it("defaults a hand-logged encounter to a plain note", () => {
    const parsed = encounterSchema.parse({
      id: "e1",
      occurredAt: new Date(),
      loggedBy: "uid-1",
      summary: "Met at the shelter.",
      createdAt: new Date(),
    });
    expect(parsed.type).toBe("note");
    expect(parsed.referrals).toEqual([]);
    expect(parsed.bucketsIdentified).toEqual([]);
    expect(parsed.followUpDue).toBeNull();
  });

  it("accepts a referral packet", () => {
    const result = encounterSchema.safeParse({
      id: "e2",
      type: "referral",
      occurredAt: new Date(),
      loggedBy: "uid-1",
      summary: "Sent 2 resources: A, B",
      bucketsIdentified: ["housing", "legal"],
      referrals: [
        { resourceId: "r1", resourceName: "A", rank: 0, score: 305 },
        { resourceId: "r2", resourceName: "B", rank: 1, score: 210 },
      ],
      followUpDue: new Date(),
      followUpCompleted: null,
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("requires a name on every referred resource", () => {
    // The packet is a record of what the veteran was handed. A row without a
    // name can't be read back as that.
    const result = encounterSchema.safeParse({
      id: "e3",
      type: "referral",
      occurredAt: new Date(),
      loggedBy: "uid-1",
      summary: "Sent 1 resource",
      referrals: [{ resourceId: "r1", resourceName: "", rank: 0, score: 1 }],
      createdAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("keeps referral fields out of the hand-entry input schema", () => {
    const parsed = encounterInputSchema.parse({
      occurredAt: new Date(),
      summary: "Talked on the phone.",
    });
    expect(parsed).not.toHaveProperty("type");
    expect(parsed).not.toHaveProperty("referrals");
    expect(parsed).not.toHaveProperty("followUpDue");
  });
});
