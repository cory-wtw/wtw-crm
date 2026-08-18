import { describe, expect, it } from "vitest";
import {
  MATCH_FLAGS,
  MATCH_FLAG_LABELS,
  intakeFlags,
  resourceFlags,
} from "../flags";
import { aResource, aVeteran, daysBefore } from "./fixtures";

describe("intakeFlags", () => {
  it("raises nothing for a complete intake", () => {
    expect(intakeFlags(aVeteran())).toEqual([]);
  });

  it("asks staff to confirm an unknown discharge", () => {
    // Unknown fails closed at the gates, so the list is shorter than the
    // veteran deserves until somebody asks the question.
    expect(intakeFlags(aVeteran({ dischargeCharacter: "unsure" }))).toContain(
      "confirm-discharge",
    );
    expect(intakeFlags(aVeteran({ dischargeCharacter: undefined }))).toContain(
      "confirm-discharge",
    );
  });

  it("does not flag a stated discharge, including other-than-honorable", () => {
    for (const discharge of ["honorable", "general", "other"] as const) {
      expect(
        intakeFlags(aVeteran({ dischargeCharacter: discharge })),
      ).not.toContain("confirm-discharge");
    }
  });

  it("asks staff to confirm location when no state was captured", () => {
    expect(intakeFlags(aVeteran({ state: undefined }))).toContain(
      "confirm-location",
    );
  });

  it("labels every flag", () => {
    for (const flag of MATCH_FLAGS) {
      expect(MATCH_FLAG_LABELS[flag]).toBeTruthy();
    }
  });
});

describe("resourceFlags", () => {
  it("raises nothing for a fresh, walk-in resource", () => {
    expect(
      resourceFlags(
        aVeteran(),
        aResource({ accessMethod: "walkin", lastVerified: daysBefore(1) }),
      ),
    ).toEqual([]);
  });

  it("flags an aging record for a quick check before sending", () => {
    expect(
      resourceFlags(aVeteran(), aResource({ verificationStatus: "aging" })),
    ).toContain("aging-record");
  });

  it("does not flag a live record", () => {
    expect(
      resourceFlags(aVeteran(), aResource({ verificationStatus: "live" })),
    ).not.toContain("aging-record");
  });

  it("flags a resource the veteran can't walk into or call", () => {
    expect(
      resourceFlags(aVeteran(), aResource({ accessMethod: "referral" })),
    ).toContain("referral-required");
  });
});
