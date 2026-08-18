import { describe, expect, it } from "vitest";
import {
  VERIFICATION_CHECK_TYPES,
  VERIFICATION_CHECK_TYPE_LABELS,
  VERIFICATION_RESULTS,
  VERIFICATION_RESULT_LABELS,
  VERIFICATION_STATUSES,
  resultForStatus,
  verificationInputSchema,
  verificationSchema,
} from "..";

describe("verificationSchema", () => {
  it("labels every check type and result", () => {
    for (const type of VERIFICATION_CHECK_TYPES) {
      expect(VERIFICATION_CHECK_TYPE_LABELS[type]).toBeTruthy();
    }
    for (const result of VERIFICATION_RESULTS) {
      expect(VERIFICATION_RESULT_LABELS[result]).toBeTruthy();
    }
  });

  it("accepts a human decision", () => {
    const result = verificationSchema.safeParse({
      id: "v1",
      resourceId: "r1",
      checkType: "manual",
      result: "flag",
      detail: "Phone disconnected, per a veteran who called.",
      checkedAt: new Date(),
      checkedBy: "uid-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an automated check attributed to the system", () => {
    const result = verificationSchema.safeParse({
      id: "v2",
      resourceId: "r1",
      checkType: "url",
      result: "fail",
      detail: "404",
      checkedAt: new Date(),
      checkedBy: "system",
    });
    expect(result.success).toBe(true);
  });

  it("requires a resourceId — a check with nothing to point at is meaningless", () => {
    const result = verificationInputSchema.safeParse({
      resourceId: "",
      checkType: "manual",
      result: "flag",
      detail: "…",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown check type", () => {
    const result = verificationInputSchema.safeParse({
      resourceId: "r1",
      checkType: "vibes",
      result: "flag",
      detail: "…",
    });
    expect(result.success).toBe(false);
  });
});

describe("resultForStatus", () => {
  it("maps every human decision to a check result", () => {
    expect(resultForStatus("live")).toBe("pass");
    expect(resultForStatus("flagged")).toBe("flag");
    expect(resultForStatus("retired")).toBe("fail");
  });

  it("returns null for aging, which nobody decides", () => {
    // aging is derived from lastVerified at read time — there is no check to
    // log, so nothing is written.
    expect(resultForStatus("aging")).toBeNull();
  });

  it("covers every status", () => {
    for (const status of VERIFICATION_STATUSES) {
      expect(resultForStatus(status)).not.toBeUndefined();
    }
  });
});
