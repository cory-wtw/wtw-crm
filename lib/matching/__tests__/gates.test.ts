import { describe, expect, it } from "vitest";
import {
  GATE_FAILURES,
  GATE_FAILURE_LABELS,
  filterByGates,
  matchesLocality,
  passesGates,
} from "../gates";
import { aResource, aVeteran, daysBefore } from "./fixtures";

describe("passesGates", () => {
  it("passes a veteran who clears everything", () => {
    const result = passesGates(aVeteran(), aResource());
    expect(result).toEqual({ passes: true, failures: [] });
  });

  it("ignores eligibility notes, however restrictive they read", () => {
    // The field is descriptive: it exists so eligibility that fits no checkbox
    // reaches the person choosing. A gate that read it would be guessing at
    // prose, and would turn a note meant to help into a silent exclusion.
    const result = passesGates(
      aVeteran(),
      aResource({
        eligibilityNotes:
          "Combat theater service or military sexual trauma only.",
      }),
    );
    expect(result).toEqual({ passes: true, failures: [] });
  });

  it("labels every failure code", () => {
    for (const failure of GATE_FAILURES) {
      expect(GATE_FAILURE_LABELS[failure]).toBeTruthy();
    }
  });
});

describe("crisis", () => {
  it("excludes everything that can't take someone tonight", () => {
    const result = passesGates(
      aVeteran({ safeTonight: false }),
      aResource({ crisisCapable: false }),
    );
    expect(result.passes).toBe(false);
    expect(result.failures).toEqual(["not-crisis-capable"]);
  });

  it("short-circuits — no other failure is reported alongside it", () => {
    // A resource that misses on several gates still reports only the one that
    // matters tonight, so the crisis screen doesn't bury the point.
    const result = passesGates(
      aVeteran({ safeTonight: false }),
      aResource({
        crisisCapable: false,
        buckets: ["work"],
        minDischarge: "honorable",
        verificationStatus: "retired",
      }),
    );
    expect(result.failures).toEqual(["not-crisis-capable"]);
  });

  it("still applies the other gates to a crisis-capable resource", () => {
    const result = passesGates(
      aVeteran({ safeTonight: false, needs: ["crisis"] }),
      aResource({ crisisCapable: true, buckets: ["work"] }),
    );
    expect(result.passes).toBe(false);
    expect(result.failures).toContain("no-bucket-overlap");
  });

  it("does not treat an unasked crisis question as a crisis", () => {
    const result = passesGates(
      aVeteran({ safeTonight: undefined }),
      aResource({ crisisCapable: false }),
    );
    expect(result.passes).toBe(true);
  });
});

describe("geography", () => {
  it("takes anyone when national", () => {
    const result = passesGates(
      aVeteran({ state: "OR", city: "Portland" }),
      aResource({ geoScope: "national" }),
    );
    expect(result.passes).toBe(true);
  });

  it("excludes an out-of-state veteran from a state-scoped resource", () => {
    const result = passesGates(
      aVeteran({ state: "GA" }),
      aResource({ geoScope: "state", geoStates: ["TN"] }),
    );
    expect(result.failures).toContain("geography");
  });

  it("admits an in-state veteran to a state-scoped resource without a city", () => {
    const result = passesGates(
      aVeteran({ state: "TN", city: undefined }),
      aResource({ geoScope: "state", geoStates: ["TN"] }),
    );
    expect(result.passes).toBe(true);
  });

  it("checks locality for a local-scoped resource", () => {
    const resource = aResource({
      geoScope: "local",
      geoStates: ["TN"],
      geoLocalities: ["Chattanooga"],
    });
    expect(passesGates(aVeteran({ city: "Chattanooga" }), resource).passes).toBe(
      true,
    );
    expect(
      passesGates(aVeteran({ city: "Cleveland" }), resource).failures,
    ).toContain("locality");
  });

  it("fails locality when the veteran gave no city", () => {
    const result = passesGates(
      aVeteran({ city: undefined }),
      aResource({
        geoScope: "local",
        geoStates: ["TN"],
        geoLocalities: ["Chattanooga"],
      }),
    );
    expect(result.failures).toContain("locality");
  });

  it("reports geography, not locality, when the state is already wrong", () => {
    const result = passesGates(
      aVeteran({ state: "GA", city: "Chattanooga" }),
      aResource({
        geoScope: "local",
        geoStates: ["TN"],
        geoLocalities: ["Chattanooga"],
      }),
    );
    expect(result.failures).toContain("geography");
    expect(result.failures).not.toContain("locality");
  });

  it("fails a veteran with no state at all against a scoped resource", () => {
    const result = passesGates(
      aVeteran({ state: undefined }),
      aResource({ geoScope: "state", geoStates: ["TN"] }),
    );
    expect(result.failures).toContain("geography");
  });
});

describe("matchesLocality", () => {
  it("ignores case, spacing, and punctuation", () => {
    expect(matchesLocality("Chattanooga", "chattanooga")).toBe(true);
    expect(matchesLocality("Chattanooga, TN", "Chattanooga")).toBe(true);
    expect(matchesLocality("Greater  Chattanooga", "CHATTANOOGA")).toBe(true);
    expect(matchesLocality("Chattanooga", "Chattanooga TN")).toBe(true);
  });

  it("does not match a different place", () => {
    expect(matchesLocality("Chattanooga", "Cleveland")).toBe(false);
  });

  it("does not match on a partial word", () => {
    expect(matchesLocality("Chattanooga", "Chatta")).toBe(false);
    expect(matchesLocality("Chattanooga", "nooga")).toBe(false);
  });

  it("matches on a whole word, which is deliberately loose", () => {
    // "Ridge" matching "East Ridge" is the cost of tolerating "Chattanooga"
    // typed as "Chattanooga, TN". Erring loose here shows staff a resource
    // they can rule out in a second; erring tight hides one they needed.
    expect(matchesLocality("East Ridge", "Ridge")).toBe(true);
  });

  it("does not resolve a city to its county", () => {
    // Known limitation: no city-to-county lookup exists, so a local-scoped
    // record has to list the cities it covers. Phase 0 surfaces these.
    expect(matchesLocality("Hamilton County", "Chattanooga")).toBe(false);
  });

  it("handles empty input", () => {
    expect(matchesLocality("", "Chattanooga")).toBe(false);
    expect(matchesLocality("Chattanooga", "")).toBe(false);
  });
});

describe("discharge", () => {
  it("admits everyone when the floor is any", () => {
    for (const discharge of ["honorable", "general", "other", "unsure"] as const) {
      const result = passesGates(
        aVeteran({ dischargeCharacter: discharge }),
        aResource({ minDischarge: "any" }),
      );
      expect(result.passes).toBe(true);
    }
  });

  it("is inclusive upward at a general floor", () => {
    const resource = aResource({ minDischarge: "general" });
    expect(
      passesGates(aVeteran({ dischargeCharacter: "honorable" }), resource)
        .passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ dischargeCharacter: "general" }), resource).passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ dischargeCharacter: "other" }), resource).failures,
    ).toContain("discharge");
  });

  it("admits only honorable at an honorable floor", () => {
    const resource = aResource({ minDischarge: "honorable" });
    expect(
      passesGates(aVeteran({ dischargeCharacter: "honorable" }), resource)
        .passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ dischargeCharacter: "general" }), resource)
        .failures,
    ).toContain("discharge");
  });

  it("fails closed on an unknown discharge", () => {
    // Unknown ranks with other-than-honorable: never send someone to a door
    // that will turn them away. The review screen prompts staff to confirm.
    const resource = aResource({ minDischarge: "general" });
    expect(
      passesGates(aVeteran({ dischargeCharacter: "unsure" }), resource)
        .failures,
    ).toContain("discharge");
    expect(
      passesGates(aVeteran({ dischargeCharacter: undefined }), resource)
        .failures,
    ).toContain("discharge");
  });
});

describe("VA enrollment", () => {
  it("excludes only a definite no", () => {
    const resource = aResource({ requiresVaEnrollment: true });
    expect(
      passesGates(aVeteran({ receivingVaBenefits: "no" }), resource).failures,
    ).toContain("va-enrollment");
    expect(
      passesGates(aVeteran({ receivingVaBenefits: "yes" }), resource).passes,
    ).toBe(true);
    // Unsure might still be enrolled — guessing costs them the resource.
    expect(
      passesGates(aVeteran({ receivingVaBenefits: "unsure" }), resource).passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ receivingVaBenefits: undefined }), resource)
        .passes,
    ).toBe(true);
  });
});

describe("valid ID", () => {
  it("requires a current ID when the resource demands one", () => {
    const resource = aResource({ requiresValidId: true });
    expect(passesGates(aVeteran({ idStatus: "valid" }), resource).passes).toBe(
      true,
    );
    for (const status of ["expired", "none", undefined] as const) {
      expect(
        passesGates(aVeteran({ idStatus: status }), resource).failures,
      ).toContain("valid-id");
    }
  });
});

describe("era", () => {
  it("is unrestricted when the list is empty", () => {
    const result = passesGates(
      aVeteran({ serviceEra: "vietnam" }),
      aResource({ eraRestriction: [] }),
    );
    expect(result.passes).toBe(true);
  });

  it("admits a listed era and excludes the rest", () => {
    const resource = aResource({ eraRestriction: ["post911", "gulf"] });
    expect(
      passesGates(aVeteran({ serviceEra: "post911" }), resource).passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ serviceEra: "vietnam" }), resource).failures,
    ).toContain("era");
  });

  it("fails closed on an unknown era", () => {
    const resource = aResource({ eraRestriction: ["post911"] });
    expect(
      passesGates(aVeteran({ serviceEra: undefined }), resource).failures,
    ).toContain("era");
  });
});

describe("dependents", () => {
  it("requires a definite yes", () => {
    const resource = aResource({ requiresDependents: true });
    expect(
      passesGates(aVeteran({ hasDependents: "yes" }), resource).passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran({ hasDependents: "no" }), resource).failures,
    ).toContain("dependents");
  });

  it("fails closed on unsure and on unasked alike", () => {
    // They differ on the record — one was asked, one wasn't — but neither is
    // grounds for sending someone to a door that will turn them away.
    const resource = aResource({ requiresDependents: true });
    expect(
      passesGates(aVeteran({ hasDependents: "unsure" }), resource).failures,
    ).toContain("dependents");
    expect(
      passesGates(aVeteran({ hasDependents: undefined }), resource).failures,
    ).toContain("dependents");
  });

  it("ignores the answer entirely when the resource doesn't require it", () => {
    const resource = aResource({ requiresDependents: false });
    for (const answer of ["yes", "no", "unsure", undefined] as const) {
      expect(
        passesGates(aVeteran({ hasDependents: answer }), resource).passes,
      ).toBe(true);
    }
  });
});

describe("bucket overlap", () => {
  it("requires at least one shared bucket", () => {
    expect(
      passesGates(
        aVeteran({ needs: ["housing", "legal"] }),
        aResource({ buckets: ["legal", "work"] }),
      ).passes,
    ).toBe(true);
    expect(
      passesGates(
        aVeteran({ needs: ["housing"] }),
        aResource({ buckets: ["work"] }),
      ).failures,
    ).toContain("no-bucket-overlap");
  });

  it("excludes an unclassified resource from everything", () => {
    const result = passesGates(aVeteran(), aResource({ buckets: [] }));
    expect(result.failures).toContain("no-bucket-overlap");
  });

  it("excludes a veteran with no needs recorded", () => {
    const result = passesGates(aVeteran({ needs: [] }), aResource());
    expect(result.failures).toContain("no-bucket-overlap");
  });
});

describe("verification", () => {
  it("matches live and aging records", () => {
    expect(
      passesGates(aVeteran(), aResource({ verificationStatus: "live" })).passes,
    ).toBe(true);
    expect(
      passesGates(aVeteran(), aResource({ verificationStatus: "aging" }))
        .passes,
    ).toBe(true);
  });

  it("withholds flagged and retired records", () => {
    for (const status of ["flagged", "retired"] as const) {
      expect(
        passesGates(aVeteran(), aResource({ verificationStatus: status }))
          .failures,
      ).toContain("unverified");
    }
  });

  it("keeps a very stale but still-aging record in play", () => {
    // Age alone never removes a resource — that's ranking's job, not a gate.
    const result = passesGates(
      aVeteran(),
      aResource({
        verificationStatus: "aging",
        lastVerified: daysBefore(900),
      }),
    );
    expect(result.passes).toBe(true);
  });
});

describe("multiple failures", () => {
  it("reports every gate that failed, not just the first", () => {
    const result = passesGates(
      aVeteran({
        state: "GA",
        dischargeCharacter: "other",
        idStatus: "none",
        needs: ["housing"],
      }),
      aResource({
        geoScope: "state",
        geoStates: ["TN"],
        minDischarge: "honorable",
        requiresValidId: true,
        buckets: ["work"],
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.failures).toEqual([
      "geography",
      "discharge",
      "valid-id",
      "no-bucket-overlap",
    ]);
  });
});

describe("filterByGates", () => {
  it("keeps survivors in input order", () => {
    const eligible = aResource({ id: "a", organizationName: "A" });
    const wrongBucket = aResource({
      id: "b",
      organizationName: "B",
      buckets: ["work"],
    });
    const alsoEligible = aResource({ id: "c", organizationName: "C" });

    const survivors = filterByGates(aVeteran(), [
      eligible,
      wrongBucket,
      alsoEligible,
    ]);
    expect(survivors.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
