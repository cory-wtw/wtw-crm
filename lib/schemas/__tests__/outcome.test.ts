import { describe, expect, it } from "vitest";
import {
  OUTCOME_KINDS,
  OUTCOME_KIND_INFO,
  outcomeAmounts,
  outcomeInputSchema,
  outcomeSummary,
} from "../outcome";

describe("outcomeAmounts", () => {
  it("files the amount by the kind's value type", () => {
    expect(outcomeAmounts("job", 2400)).toEqual({ monthlyValue: 2400 });
    expect(outcomeAmounts("financialAssistance", 800)).toEqual({ oneTimeValue: 800 });
  });

  it("drops an amount the kind doesn't take", () => {
    expect(outcomeAmounts("housedPermanent", 500)).toEqual({});
    expect(outcomeAmounts("job", undefined)).toEqual({});
  });
});

describe("outcomeInputSchema", () => {
  it("coerces a date string and rejects unknown kinds", () => {
    const ok = outcomeInputSchema.safeParse({ kind: "job", achievedAt: "2026-10-01T12:00:00", wtwRole: "helped" });
    expect(ok.success && ok.data.achievedAt instanceof Date).toBe(true);
    expect(outcomeInputSchema.safeParse({ kind: "lottery", achievedAt: "2026-10-01", wtwRole: "helped" }).success).toBe(false);
  });

  it("requires an answer to Did WTW help?", () => {
    expect(outcomeInputSchema.safeParse({ kind: "job", achievedAt: "2026-10-01" }).success).toBe(false);
    expect(outcomeInputSchema.safeParse({ kind: "job", achievedAt: "2026-10-01", wtwRole: "none" }).success).toBe(true);
  });
});

describe("outcomeSummary", () => {
  it("reads as one line", () => {
    expect(outcomeSummary({ kind: "job", monthlyValue: 2400, resourceName: "Goodwill" })).toBe(
      "Got a job — $2,400/mo, via Goodwill.",
    );
  });
});

it("every kind has a label", () => {
  for (const k of OUTCOME_KINDS) expect(OUTCOME_KIND_INFO[k].label).toBeTruthy();
});
