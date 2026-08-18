import { describe, expect, it } from "vitest";
import { ELIGIBILITY_FIELDS, mergeEligibility } from "./intake";

describe("mergeEligibility", () => {
  it("writes an answer to an empty record", () => {
    const { updates, effective } = mergeEligibility(
      {},
      { dischargeCharacter: "honorable" },
    );
    expect(updates).toEqual({ dischargeCharacter: "honorable" });
    expect(effective.dischargeCharacter).toBe("honorable");
  });

  it("leaves a stored value alone when the question wasn't asked", () => {
    // The whole point: a hurried second intake must not wipe a good answer
    // somebody collected in a better conversation.
    const stored = {
      dischargeCharacter: "honorable" as const,
      serviceEra: "vietnam" as const,
      idStatus: "valid" as const,
      hasDependents: "yes" as const,
    };
    const { updates, effective } = mergeEligibility(stored, {});
    expect(updates).toEqual({});
    expect(effective).toEqual(stored);
  });

  it("keeps unasked fields while updating the one that was asked", () => {
    const { updates, effective } = mergeEligibility(
      { dischargeCharacter: "honorable", idStatus: "valid" },
      { idStatus: "expired" },
    );
    expect(updates).toEqual({ idStatus: "expired" });
    expect(effective).toEqual({
      dischargeCharacter: "honorable",
      idStatus: "expired",
    });
  });

  it("records uncertainty as an answer, not as silence", () => {
    // "unsure" overwrites: somebody asked and this is what they were told.
    const { updates, effective } = mergeEligibility(
      { idStatus: "valid" },
      { idStatus: "unsure" },
    );
    expect(updates).toEqual({ idStatus: "unsure" });
    expect(effective.idStatus).toBe("unsure");
  });

  it("skips a no-op write when the answer is unchanged", () => {
    const { updates, effective } = mergeEligibility(
      { serviceEra: "gulf" },
      { serviceEra: "gulf" },
    );
    expect(updates).toEqual({});
    expect(effective.serviceEra).toBe("gulf");
  });

  it("never emits null or undefined as an update", () => {
    const { updates } = mergeEligibility(
      { dischargeCharacter: "general", idStatus: "none" },
      {},
    );
    for (const value of Object.values(updates)) {
      expect(value).toBeDefined();
      expect(value).not.toBeNull();
    }
  });

  it("handles every field the same way", () => {
    const submitted = {
      dischargeCharacter: "general" as const,
      serviceEra: "post911" as const,
      idStatus: "none" as const,
      hasDependents: "unsure" as const,
    };
    const { updates } = mergeEligibility({}, submitted);
    expect(Object.keys(updates).sort()).toEqual([...ELIGIBILITY_FIELDS].sort());
  });

  it("returns an empty merge for an empty record and an empty submit", () => {
    expect(mergeEligibility({}, {})).toEqual({ updates: {}, effective: {} });
  });
});
