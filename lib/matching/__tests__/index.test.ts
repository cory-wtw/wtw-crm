import { describe, expect, it } from "vitest";
import { findCandidates } from "..";
import { NOW, aResource, aVeteran, daysBefore } from "./fixtures";

describe("findCandidates", () => {
  it("gates first, then ranks what survives", () => {
    const veteran = aVeteran({
      needs: ["housing"],
      state: "TN",
      city: "Chattanooga",
    });

    const local = aResource({
      id: "local",
      organizationName: "Local Housing",
      geoScope: "local",
      geoStates: ["TN"],
      geoLocalities: ["Chattanooga"],
      accessMethod: "walkin",
      typicalWait: "sameday",
      lastVerified: daysBefore(2),
    });
    const national = aResource({
      id: "national",
      organizationName: "National Housing",
      accessMethod: "web",
      typicalWait: "months",
    });
    const outOfState = aResource({
      id: "out",
      organizationName: "Georgia Housing",
      geoScope: "state",
      geoStates: ["GA"],
    });
    const retired = aResource({
      id: "retired",
      organizationName: "Closed Program",
      verificationStatus: "retired",
    });

    const candidates = findCandidates(
      veteran,
      [national, outOfState, local, retired],
      { now: NOW },
    );

    expect(candidates.map((c) => c.resource.id)).toEqual(["local", "national"]);
  });

  it("trims to the limit staff reads", () => {
    const resources = Array.from({ length: 12 }, (_, i) =>
      aResource({ id: `r${i}`, organizationName: `Org ${i}` }),
    );
    const candidates = findCandidates(aVeteran(), resources, {
      limit: 8,
      now: NOW,
    });
    expect(candidates).toHaveLength(8);
  });

  it("returns everything when no limit is given", () => {
    const resources = Array.from({ length: 12 }, (_, i) =>
      aResource({ id: `r${i}`, organizationName: `Org ${i}` }),
    );
    expect(findCandidates(aVeteran(), resources, { now: NOW })).toHaveLength(12);
  });

  it("returns nothing when every resource is gated out", () => {
    const candidates = findCandidates(
      aVeteran({ needs: ["transport"] }),
      [aResource({ buckets: ["housing"] })],
      { now: NOW },
    );
    expect(candidates).toEqual([]);
  });

  it("collapses to crisis-capable resources when it's tonight", () => {
    const veteran = aVeteran({ safeTonight: false, needs: ["crisis"] });
    const shelter = aResource({
      id: "shelter",
      organizationName: "Shelter",
      buckets: ["crisis"],
      crisisCapable: true,
    });
    const daytime = aResource({
      id: "daytime",
      organizationName: "Daytime Program",
      buckets: ["crisis"],
      crisisCapable: false,
    });

    const candidates = findCandidates(veteran, [daytime, shelter], {
      now: NOW,
    });
    expect(candidates.map((c) => c.resource.id)).toEqual(["shelter"]);
  });
});

describe("duplicate records", () => {
  it("keeps one entry per organization", () => {
    const ranked = findCandidates(aVeteran(), [
      aResource({ id: "a", organizationName: "Chattanooga Area Food Bank" }),
      aResource({ id: "b", organizationName: "Chattanooga Area Food Bank " }),
    ]);
    expect(ranked).toHaveLength(1);
  });
});

describe("duplicate records by website", () => {
  it("collapses two names for the same site", () => {
    const ranked = findCandidates(aVeteran(), [
      aResource({ id: "a", organizationName: "Chattanooga Area Food Bank", website: "https://www.chattfoodbank.org/" }),
      aResource({ id: "b", organizationName: "CAFB Walker County", website: "chattfoodbank.org" }),
    ]);
    expect(ranked).toHaveLength(1);
  });

  it("keeps different pages on a shared host apart", () => {
    const ranked = findCandidates(aVeteran(), [
      aResource({ id: "a", organizationName: "Chattanooga Vet Center", website: "https://www.va.gov/chattanooga-vet-center/" }),
      aResource({ id: "b", organizationName: "Chattanooga VA Clinic", website: "https://www.va.gov/tennessee-valley-health-care/" }),
    ]);
    expect(ranked).toHaveLength(2);
  });
});

describe("findCandidates — a lost ID", () => {
  it("puts the ID office above legal aid for someone with no ID", () => {
    const ranked = findCandidates(
      aVeteran({ needs: ["housing", "legal", "transport"], idStatus: "none" }),
      [
        aResource({ id: "aid", organizationName: "Legal Aid Society", buckets: ["legal"] }),
        aResource({ id: "sos", organizationName: "Secretary of State", buckets: ["legal"], replacesId: true }),
        aResource({ id: "bus", organizationName: "City Bus", buckets: ["transport"] }),
      ],
      { now: NOW },
    );
    expect(ranked[0].resource.id).toBe("sos");
    expect(ranked.map((r) => r.resource.id)).toContain("bus");
  });
});

