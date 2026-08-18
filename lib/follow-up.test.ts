import { describe, expect, it } from "vitest";
import type { FollowUpOutcome, Verification } from "@/lib/schemas";
import {
  UNREACHABLE_WINDOW_DAYS,
  recentUnreachableCount,
  resultForOutcome,
  shouldFlagForUnreachable,
} from "./follow-up";

const NOW = new Date("2026-08-18T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function aVerification(overrides: Partial<Verification> = {}): Verification {
  return {
    id: "v1",
    resourceId: "r1",
    checkType: "humanOutcome",
    result: "flag",
    detail: "Veteran couldn't get through.",
    checkedAt: daysAgo(10),
    checkedBy: "uid-staff",
    outcome: "unreachable",
    ...overrides,
  };
}

describe("resultForOutcome", () => {
  it("passes the outcomes that say nothing bad about the record", () => {
    expect(resultForOutcome("helped")).toBe("pass");
    expect(resultForOutcome("reached")).toBe("pass");
  });

  it("passes a veteran's own decision not to go", () => {
    // Flagging this would punish a good record for a personal choice.
    expect(resultForOutcome("declined")).toBe("pass");
  });

  it("flags being turned away", () => {
    // They cleared our gates and were refused, so a gate value is wrong.
    expect(resultForOutcome("ineligible")).toBe("flag");
  });

  it("flags an unreachable resource", () => {
    expect(resultForOutcome("unreachable")).toBe("flag");
  });

  it("covers every outcome", () => {
    const outcomes: FollowUpOutcome[] = [
      "reached",
      "unreachable",
      "ineligible",
      "declined",
      "helped",
    ];
    for (const outcome of outcomes) {
      expect(["pass", "flag", "fail"]).toContain(resultForOutcome(outcome));
    }
  });
});

describe("recentUnreachableCount", () => {
  it("counts unreachable reports inside the window", () => {
    const priors = [aVerification({ checkedAt: daysAgo(5) }), aVerification()];
    expect(recentUnreachableCount(priors, NOW)).toBe(2);
  });

  it("ignores anything older than the window", () => {
    const priors = [
      aVerification({ checkedAt: daysAgo(UNREACHABLE_WINDOW_DAYS + 1) }),
    ];
    expect(recentUnreachableCount(priors, NOW)).toBe(0);
  });

  it("counts a report exactly on the window boundary", () => {
    const priors = [
      aVerification({ checkedAt: daysAgo(UNREACHABLE_WINDOW_DAYS) }),
    ];
    expect(recentUnreachableCount(priors, NOW)).toBe(1);
  });

  it("ignores other outcomes and other check types", () => {
    const priors = [
      aVerification({ outcome: "helped", result: "pass" }),
      aVerification({ outcome: "ineligible" }),
      aVerification({ checkType: "url", outcome: undefined }),
      aVerification({ checkType: "manual", outcome: undefined }),
    ];
    expect(recentUnreachableCount(priors, NOW)).toBe(0);
  });
});

describe("shouldFlagForUnreachable", () => {
  it("does not flag the first unreachable report", () => {
    // One veteran might have called at lunchtime.
    expect(
      shouldFlagForUnreachable({
        outcome: "unreachable",
        priorVerifications: [],
        now: NOW,
      }),
    ).toBe(false);
  });

  it("flags the second inside the window", () => {
    expect(
      shouldFlagForUnreachable({
        outcome: "unreachable",
        priorVerifications: [aVerification({ checkedAt: daysAgo(30) })],
        now: NOW,
      }),
    ).toBe(true);
  });

  it("does not flag when the earlier report has aged out", () => {
    expect(
      shouldFlagForUnreachable({
        outcome: "unreachable",
        priorVerifications: [
          aVerification({ checkedAt: daysAgo(UNREACHABLE_WINDOW_DAYS + 5) }),
        ],
        now: NOW,
      }),
    ).toBe(false);
  });

  it("never flags on any other outcome", () => {
    for (const outcome of [
      "reached",
      "ineligible",
      "declined",
      "helped",
    ] as const) {
      expect(
        shouldFlagForUnreachable({
          outcome,
          priorVerifications: [aVerification(), aVerification()],
          now: NOW,
        }),
      ).toBe(false);
    }
  });
});
