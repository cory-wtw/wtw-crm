import { describe, expect, it } from "vitest";
import { classificationGaps } from "@/lib/schemas";
import {
  externalIdFor,
  mapFacility,
  TYPE_MAPPING,
  VA_FACILITY_TYPES,
  type VaFacility,
} from "./va-facility-mapping";

function aFacility(overrides: Partial<VaFacility["attributes"]> = {}): VaFacility {
  return {
    id: "vha_614",
    attributes: {
      name: "Chattanooga VA Clinic",
      facilityType: "va_health_facility",
      classification: "Multi-Specialty CBOC",
      website: "https://www.va.gov/tennessee-valley-health-care",
      phone: { main: "423-893-6500" },
      address: {
        physical: {
          address1: "6470 Vance Rd",
          city: "Chattanooga",
          state: "TN",
          zip: "37421",
        },
      },
      ...overrides,
    },
  };
}

describe("externalIdFor", () => {
  it("namespaces the VA id so sources can't collide", () => {
    expect(externalIdFor("vc_0101V")).toBe("va-facilities:vc_0101V");
  });
});

describe("mapFacility", () => {
  it("maps a health facility to a state-scoped record", () => {
    const mapped = mapFacility(aFacility(), "health");
    expect(mapped).not.toBeNull();
    expect(mapped!.facts.organizationName).toBe("Chattanooga VA Clinic");
    expect(mapped!.facts.geoScope).toBe("state");
    expect(mapped!.facts.geoStates).toEqual(["TN"]);
    expect(mapped!.externalId).toBe("va-facilities:vha_614");
  });

  it("produces a record with no classification gaps", () => {
    // An import that lands records the matcher can never offer would be worse
    // than no import at all.
    for (const type of VA_FACILITY_TYPES) {
      const mapped = mapFacility(aFacility(), type);
      expect(
        classificationGaps({
          buckets: mapped!.gates.buckets,
          geoScope: mapped!.facts.geoScope,
          geoStates: mapped!.facts.geoStates,
          geoLocalities: mapped!.facts.geoLocalities,
        }),
      ).toEqual([]);
    }
  });

  it("normalizes the state code", () => {
    const mapped = mapFacility(
      aFacility({
        address: { physical: { city: "Chattanooga", state: "tn" } },
      }),
      "health",
    );
    expect(mapped!.facts.geoStates).toEqual(["TN"]);
  });

  it("drops a facility with no usable state", () => {
    // Written nationally it would match everybody; written stateless it would
    // match nobody. Both are worse than a line in the report.
    for (const physical of [
      { city: "Somewhere" },
      { city: "Somewhere", state: "" },
      { city: "Somewhere", state: "Tennessee" },
    ]) {
      expect(mapFacility(aFacility({ address: { physical } }), "health")).toBeNull();
    }
  });

  it("drops a facility with no name", () => {
    expect(mapFacility(aFacility({ name: "  " }), "health")).toBeNull();
  });

  it("sends veterans to a Vet Center's door and a clinic's phone", () => {
    const vetCenter = mapFacility(aFacility(), "vet_center");
    expect(vetCenter!.facts.accessMethod).toBe("walkin");
    expect(vetCenter!.facts.accessValue).toContain("6470 Vance Rd");

    const clinic = mapFacility(aFacility(), "health");
    expect(clinic!.facts.accessMethod).toBe("phone");
    expect(clinic!.facts.accessValue).toBe("423-893-6500");
  });

  it("never points at a channel the record hasn't got", () => {
    const noPhone = mapFacility(aFacility({ phone: null }), "health");
    expect(noPhone!.facts.accessMethod).toBe("walkin");
    expect(noPhone!.facts.accessValue).toContain("6470 Vance Rd");

    const noAddress = mapFacility(
      aFacility({ address: { physical: { state: "TN", city: "Chattanooga" } } }),
      "vet_center",
    );
    // No street address to walk to, so fall back to the phone.
    expect(noAddress!.facts.accessMethod).toBe("phone");
    expect(noAddress!.facts.accessValue).toBe("423-893-6500");
  });

  it("carries the VA enrollment gate only where it applies", () => {
    expect(mapFacility(aFacility(), "health")!.gates.requiresVaEnrollment).toBe(
      true,
    );
    expect(
      mapFacility(aFacility(), "vet_center")!.gates.requiresVaEnrollment,
    ).toBe(false);
    expect(
      mapFacility(aFacility(), "benefits")!.gates.requiresVaEnrollment,
    ).toBe(false);
  });

  it("never sets a discharge floor or an ID requirement", () => {
    // Both would hide these facilities from the veterans most likely to need
    // them, on an eligibility judgement this system must not make.
    for (const type of VA_FACILITY_TYPES) {
      const mapped = mapFacility(aFacility(), type);
      expect(mapped!.gates.minDischarge).toBe("any");
      expect(mapped!.gates.requiresValidId).toBe(false);
    }
  });

  it("never claims same-day capability", () => {
    // Over-claiming sends someone with nowhere to sleep to a door that may not
    // open tonight. A reviewer who knows a site can flip it.
    for (const type of VA_FACILITY_TYPES) {
      expect(mapFacility(aFacility(), type)!.gates.crisisCapable).toBe(false);
    }
  });

  it("never invents a wait time", () => {
    for (const type of VA_FACILITY_TYPES) {
      expect(mapFacility(aFacility(), type)!.gates.typicalWait).toBe("unknown");
    }
  });

  it("puts the classification in the description without editorialising", () => {
    const mapped = mapFacility(aFacility(), "health");
    expect(mapped!.facts.description).toBe(
      "VA health facility. Multi-Specialty CBOC.",
    );
  });

  it("copes with no classification on file", () => {
    const mapped = mapFacility(aFacility({ classification: null }), "health");
    expect(mapped!.facts.description).toBe("VA health facility.");
  });
});

describe("TYPE_MAPPING", () => {
  it("gives every type at least one bucket", () => {
    for (const type of VA_FACILITY_TYPES) {
      expect(TYPE_MAPPING[type].buckets.length).toBeGreaterThan(0);
    }
  });

  it("writes descriptions the referral screen won't strip", () => {
    // These land in packets. Anything reading as a promise or a dollar figure
    // would be replaced with a neutral line, wasting the description.
    for (const type of VA_FACILITY_TYPES) {
      const description = TYPE_MAPPING[type].description;
      expect(description).not.toMatch(/\$|guarantee|approv|entitled|rating/i);
    }
  });
});
