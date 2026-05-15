import { describe, expect, it } from "vitest";
import {
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  pipelineHistoryEntrySchema,
  pipelineStageSchema,
} from "..";

describe("pipelineStageSchema", () => {
  it("accepts every stage in the canonical order", () => {
    expect(PIPELINE_STAGES).toEqual([
      "found",
      "connected",
      "filed",
      "won",
      "lost",
    ]);
    for (const stage of PIPELINE_STAGES) {
      expect(pipelineStageSchema.safeParse(stage).success).toBe(true);
    }
  });

  it("rejects unknown stages", () => {
    expect(pipelineStageSchema.safeParse("paused").success).toBe(false);
  });

  it("has a human label for every stage", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(PIPELINE_LABELS[stage]).toBeTruthy();
    }
  });
});

describe("pipelineHistoryEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = pipelineHistoryEntrySchema.safeParse({
      stage: "found",
      enteredAt: new Date(),
      byUid: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("requires all fields", () => {
    expect(
      pipelineHistoryEntrySchema.safeParse({ stage: "found" }).success,
    ).toBe(false);
    expect(
      pipelineHistoryEntrySchema.safeParse({
        stage: "found",
        enteredAt: new Date(),
      }).success,
    ).toBe(false);
  });
});
