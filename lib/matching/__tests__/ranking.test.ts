import { describe, expect, it } from "vitest";
import { AGING_AFTER_DAYS, STALE_AFTER_DAYS } from "@/lib/schemas";
import {
  RANKING_WEIGHTS,
  freshnessScore,
  matchedBuckets,
  rankResources,
  scoreResource,
} from "../ranking";
import { NOW, aResource, aVeteran, daysBefore } from "./fixtures";

describe("freshnessScore", () => {
  it("scores a recently verified record at full freshness", () => {
    expect(freshnessScore(daysBefore(1), NOW)).toBe(
      RANKING_WEIGHTS.freshness.fresh,
    );
    expect(freshnessScore(daysBefore(AGING_AFTER_DAYS - 1), NOW)).toBe(
      RANKING_WEIGHTS.freshness.fresh,
    );
  });

  it("halves at the aging threshold", () => {
    expect(freshnessScore(daysBefore(AGING_AFTER_DAYS), NOW)).toBe(
      RANKING_WEIGHTS.freshness.aging,
    );
    expect(freshnessScore(daysBefore(STALE_AFTER_DAYS - 1), NOW)).toBe(
      RANKING_WEIGHTS.freshness.aging,
    );
  });

  it("scores zero past the stale threshold", () => {
    expect(freshnessScore(daysBefore(STALE_AFTER_DAYS), NOW)).toBe(0);
    expect(freshnessScore(daysBefore(2000), NOW)).toBe(0);
  });

  it("treats a never-verified record as stale, not fresh", () => {
    expect(freshnessScore(null, NOW)).toBe(0);
    expect(freshnessScore(undefined, NOW)).toBe(0);
  });
});

describe("matchedBuckets", () => {
  it("returns only the overlap", () => {
    const matched = matchedBuckets(
      aVeteran({ needs: ["housing", "legal", "work"] }),
      aResource({ buckets: ["legal", "housing", "health"] }),
    );
    expect(matched).toEqual(["legal", "housing"]);
  });
});

describe("scoreResource", () => {
  it("adds its signals to the total", () => {
    const breakdown = scoreResource(aVeteran(), aResource(), NOW);
    const { total, ...signals } = breakdown;
    expect(Object.values(signals).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("scores a plain national phone resource from its parts", () => {
    const breakdown = scoreResource(
      aVeteran(),
      aResource({
        geoScope: "national",
        accessMethod: "phone",
        typicalWait: "unknown",
        lastVerified: daysBefore(1),
        buckets: ["housing"],
      }),
      NOW,
    );
    expect(breakdown).toEqual({
      crisis: 0,
      legalUnlock: 0,
      geography: RANKING_WEIGHTS.geography.national,
      access: RANKING_WEIGHTS.access.phone,
      wait: RANKING_WEIGHTS.wait.unknown,
      freshness: RANKING_WEIGHTS.freshness.fresh,
      bucketCoverage: RANKING_WEIGHTS.bucketCoverage,
      total: 40 + 60 + 0 + 60 + 25,
    });
  });

  it("pays crisis only when the veteran isn't safe tonight", () => {
    const crisisResource = aResource({
      crisisCapable: true,
      buckets: ["crisis"],
    });
    expect(
      scoreResource(
        aVeteran({ safeTonight: false, needs: ["crisis"] }),
        crisisResource,
        NOW,
      ).crisis,
    ).toBe(RANKING_WEIGHTS.crisis);
    expect(
      scoreResource(
        aVeteran({ safeTonight: true, needs: ["crisis"] }),
        crisisResource,
        NOW,
      ).crisis,
    ).toBe(0);
  });

  it("pays the legal unlock when the veteran has no valid ID", () => {
    const legal = aResource({ buckets: ["legal"] });
    expect(
      scoreResource(aVeteran({ idStatus: "none" }), legal, NOW).legalUnlock,
    ).toBe(RANKING_WEIGHTS.legalUnlock);
    expect(
      scoreResource(aVeteran({ idStatus: "expired" }), legal, NOW).legalUnlock,
    ).toBe(RANKING_WEIGHTS.legalUnlock);
    expect(
      scoreResource(aVeteran({ idStatus: "valid" }), legal, NOW).legalUnlock,
    ).toBe(0);
  });

  it("scores geography by how local the resource is", () => {
    const at = (geoScope: "national" | "state" | "metro" | "county") =>
      scoreResource(aVeteran(), aResource({ geoScope }), NOW).geography;
    expect(at("county")).toBe(RANKING_WEIGHTS.geography.locality);
    expect(at("metro")).toBe(RANKING_WEIGHTS.geography.locality);
    expect(at("state")).toBe(RANKING_WEIGHTS.geography.state);
    expect(at("national")).toBe(RANKING_WEIGHTS.geography.national);
    expect(at("county")).toBeGreaterThan(at("state"));
    expect(at("state")).toBeGreaterThan(at("national"));
  });

  it("prefers the door that takes least work to get through", () => {
    const at = (accessMethod: "walkin" | "phone" | "web" | "referral") =>
      scoreResource(aVeteran(), aResource({ accessMethod }), NOW).access;
    expect(at("walkin")).toBeGreaterThan(at("phone"));
    expect(at("phone")).toBeGreaterThan(at("web"));
    expect(at("web")).toBeGreaterThan(at("referral"));
  });

  it("prefers the shorter wait, and never rewards an unknown one", () => {
    const at = (
      typicalWait: "sameday" | "days" | "weeks" | "months" | "unknown",
    ) => scoreResource(aVeteran(), aResource({ typicalWait }), NOW).wait;
    expect(at("sameday")).toBeGreaterThan(at("days"));
    expect(at("days")).toBeGreaterThan(at("weeks"));
    expect(at("weeks")).toBeGreaterThan(at("months"));
    expect(at("unknown")).toBe(at("months"));
  });

  it("pays per matched bucket", () => {
    const breakdown = scoreResource(
      aVeteran({ needs: ["housing", "legal", "work"] }),
      aResource({ buckets: ["housing", "legal"] }),
      NOW,
    );
    expect(breakdown.bucketCoverage).toBe(RANKING_WEIGHTS.bucketCoverage * 2);
  });

  it("counts only buckets the veteran actually asked for", () => {
    const breakdown = scoreResource(
      aVeteran({ needs: ["housing"] }),
      aResource({ buckets: ["housing", "work", "health"] }),
      NOW,
    );
    expect(breakdown.bucketCoverage).toBe(RANKING_WEIGHTS.bucketCoverage);
  });
});

describe("rankResources", () => {
  it("puts a crisis-capable resource above everything when it's tonight", () => {
    const veteran = aVeteran({ safeTonight: false, needs: ["crisis"] });
    // The comfortable option: local, walk-in, same day, fresh, but it can't
    // take anyone tonight.
    const comfortable = aResource({
      id: "comfortable",
      organizationName: "Comfortable",
      buckets: ["crisis"],
      crisisCapable: false,
      geoScope: "county",
      geoStates: ["TN"],
      geoLocalities: ["Chattanooga"],
      accessMethod: "walkin",
      typicalWait: "sameday",
      lastVerified: daysBefore(1),
    });
    const shelter = aResource({
      id: "shelter",
      organizationName: "Shelter",
      buckets: ["crisis"],
      crisisCapable: true,
      geoScope: "national",
      accessMethod: "referral",
      typicalWait: "months",
      lastVerified: daysBefore(400),
    });

    const ranked = rankResources(veteran, [comfortable, shelter], NOW);
    expect(ranked[0].resource.id).toBe("shelter");
  });

  it("surfaces the ID before the housing the veteran called about", () => {
    // No valid ID blocks a voucher, a job, and a bank account, so Legal &
    // Records outranks the stated need on purpose.
    const veteran = aVeteran({
      needs: ["housing", "legal"],
      idStatus: "none",
    });
    const housing = aResource({
      id: "housing",
      organizationName: "Housing Co",
      buckets: ["housing"],
    });
    const records = aResource({
      id: "records",
      organizationName: "Records Help",
      buckets: ["legal"],
    });

    const ranked = rankResources(veteran, [housing, records], NOW);
    expect(ranked[0].resource.id).toBe("records");
  });

  it("ranks a stale record last rather than dropping it", () => {
    const fresh = aResource({
      id: "fresh",
      organizationName: "Fresh",
      lastVerified: daysBefore(1),
    });
    const stale = aResource({
      id: "stale",
      organizationName: "Stale",
      lastVerified: daysBefore(STALE_AFTER_DAYS + 500),
    });

    const ranked = rankResources(aVeteran(), [stale, fresh], NOW);
    expect(ranked.map((r) => r.resource.id)).toEqual(["fresh", "stale"]);
    // Still on the list — nothing was excluded for age.
    expect(ranked).toHaveLength(2);
    expect(ranked[1].breakdown.freshness).toBe(0);
  });

  it("sorts highest first and carries the breakdown and matched buckets", () => {
    const ranked = rankResources(
      aVeteran({ needs: ["housing", "legal"] }),
      [
        aResource({ id: "a", organizationName: "A", buckets: ["housing"] }),
        aResource({
          id: "b",
          organizationName: "B",
          buckets: ["housing", "legal"],
        }),
      ],
      NOW,
    );
    expect(ranked[0].resource.id).toBe("b");
    expect(ranked[0].score).toBe(ranked[0].breakdown.total);
    expect(ranked[0].matchedBuckets).toEqual(["housing", "legal"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("breaks ties by organization name so the order is stable", () => {
    const zebra = aResource({ id: "z", organizationName: "Zebra Services" });
    const acme = aResource({ id: "a", organizationName: "Acme Services" });
    const ranked = rankResources(aVeteran(), [zebra, acme], NOW);
    expect(ranked.map((r) => r.resource.id)).toEqual(["a", "z"]);
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it("returns an empty list for no survivors", () => {
    expect(rankResources(aVeteran(), [], NOW)).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const first = aResource({ id: "a", organizationName: "A" });
    const second = aResource({
      id: "b",
      organizationName: "B",
      buckets: ["housing", "legal"],
    });
    const input = [first, second];
    rankResources(aVeteran({ needs: ["housing", "legal"] }), input, NOW);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
