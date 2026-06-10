import { describe, expect, it } from "vitest";
import {
  intakeBranchToVeteran,
  intakeHousingToVeteran,
  veteranBranchToIntake,
  veteranHousingToIntake,
} from "./intake-veteran-sync";

describe("intakeBranchToVeteran", () => {
  it("returns null when no branches", () => {
    expect(intakeBranchToVeteran([])).toBeNull();
  });

  it("returns null when more than one branch", () => {
    expect(intakeBranchToVeteran(["army", "navy"])).toBeNull();
  });

  it("returns the single branch when it exists on the veteran enum", () => {
    expect(intakeBranchToVeteran(["army"])).toBe("army");
    expect(intakeBranchToVeteran(["navy"])).toBe("navy");
    expect(intakeBranchToVeteran(["marines"])).toBe("marines");
    expect(intakeBranchToVeteran(["air_force"])).toBe("air_force");
    expect(intakeBranchToVeteran(["coast_guard"])).toBe("coast_guard");
    expect(intakeBranchToVeteran(["space_force"])).toBe("space_force");
  });

  it("returns null for branches that don't exist on the veteran enum", () => {
    // National Guard and Reserves aren't on the veteran's branch enum;
    // skipping is safer than guessing.
    expect(intakeBranchToVeteran(["national_guard"])).toBeNull();
    expect(intakeBranchToVeteran(["reserves"])).toBeNull();
  });
});

describe("veteranBranchToIntake", () => {
  it("returns an empty array when veteran has no branch", () => {
    expect(veteranBranchToIntake(null)).toEqual([]);
    expect(veteranBranchToIntake(undefined)).toEqual([]);
  });

  it("returns a single-element array for prefill", () => {
    expect(veteranBranchToIntake("army")).toEqual(["army"]);
    expect(veteranBranchToIntake("space_force")).toEqual(["space_force"]);
  });
});

describe("intakeHousingToVeteran", () => {
  it("maps unsheltered + vehicle to unsheltered", () => {
    expect(intakeHousingToVeteran("unsheltered")).toBe("unsheltered");
    expect(intakeHousingToVeteran("vehicle")).toBe("unsheltered");
  });

  it("maps shelter / couch surfing / transitional to transitional", () => {
    expect(intakeHousingToVeteran("shelter")).toBe("transitional");
    expect(intakeHousingToVeteran("couch_surfing")).toBe("transitional");
    expect(intakeHousingToVeteran("transitional")).toBe("transitional");
  });

  it("maps renting + own_home to housed", () => {
    expect(intakeHousingToVeteran("renting")).toBe("housed");
    expect(intakeHousingToVeteran("own_home")).toBe("housed");
  });

  it("returns null for ambiguous or empty values", () => {
    expect(intakeHousingToVeteran("other")).toBeNull();
    expect(intakeHousingToVeteran(null)).toBeNull();
    expect(intakeHousingToVeteran(undefined)).toBeNull();
  });
});

describe("veteranHousingToIntake", () => {
  it("rides clean values across", () => {
    expect(veteranHousingToIntake("unsheltered")).toBe("unsheltered");
    expect(veteranHousingToIntake("transitional")).toBe("transitional");
  });

  it("returns null for housed (renting vs own_home is ambiguous)", () => {
    expect(veteranHousingToIntake("housed")).toBeNull();
  });

  it("returns null for unknown / empty", () => {
    expect(veteranHousingToIntake("unknown")).toBeNull();
    expect(veteranHousingToIntake(null)).toBeNull();
    expect(veteranHousingToIntake(undefined)).toBeNull();
  });
});
