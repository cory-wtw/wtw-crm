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
      geoScope: "county",
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
