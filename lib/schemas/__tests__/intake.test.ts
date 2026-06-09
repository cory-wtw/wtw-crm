import { describe, expect, it } from "vitest";
import {
  INTAKE_BRANCHES,
  INTAKE_DOC_KEYS,
  intakeInputSchema,
  intakeStatusSchema,
} from "..";

describe("intakeStatusSchema", () => {
  it("accepts draft and complete", () => {
    expect(intakeStatusSchema.safeParse("draft").success).toBe(true);
    expect(intakeStatusSchema.safeParse("complete").success).toBe(true);
  });
  it("rejects everything else", () => {
    expect(intakeStatusSchema.safeParse("in_progress").success).toBe(false);
  });
});

describe("intakeInputSchema", () => {
  it("accepts an entirely empty intake (all fields optional)", () => {
    const result = intakeInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts every branch", () => {
    for (const branch of INTAKE_BRANCHES) {
      const result = intakeInputSchema.safeParse({
        service: { branches: [branch] },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown branches", () => {
    const result = intakeInputSchema.safeParse({
      service: { branches: ["space_corps"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown sleep options", () => {
    const result = intakeInputSchema.safeParse({
      sleep: ["counting_sheep"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for frequency selectors", () => {
    const result = intakeInputSchema.safeParse({
      bodyToday: {
        headBrainMemory: null,
        skin: null,
        hearing: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown skin frequency", () => {
    const result = intakeInputSchema.safeParse({
      bodyToday: { skin: "daily" }, // "daily" is on standard freq, not skin
    });
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated intake snapshot", () => {
    const result = intakeInputSchema.safeParse({
      basics: {
        fullName: "Cory Gold",
        bestPhone: "(423) 509-2278",
      },
      service: { branches: ["army"], yearsServed: "4" },
      bodyToday: {
        headBrainMemory: "weekly",
        skin: "comes_and_go",
        hearing: "constant",
      },
      sleep: ["nightmares"],
      mentalHealth: ["on_edge_a_lot"],
      coping: ["isolation"],
      housing: "unsheltered",
      income: ["no_income"],
      vaCare: { enrollment: "not_enrolled", rating: "no_rating" },
      documents: Object.fromEntries(
        INTAKE_DOC_KEYS.map((k) => [k, { status: "lacks" }]),
      ),
      vsoBestFit: { types: ["county_vso", "dva"] },
    });
    expect(result.success).toBe(true);
  });
});
