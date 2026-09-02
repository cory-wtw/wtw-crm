import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseSeedResource,
  seedExternalId,
  type SeedResource,
} from "./resource-import";
import { resourceInputSchema } from "@/lib/schemas";

function aSeed(overrides: Partial<SeedResource> = {}): SeedResource {
  return {
    org_name: "Chattanooga Vet Center",
    buckets: ["Mental Health & Recovery"],
    service_area: "National",
    min_discharge: "Any discharge, including other-than-honorable",
    access_method: "Call",
    typical_wait: "Days",
    status: "Live",
    ...overrides,
  };
}

describe("parseSeedResource", () => {
  it("maps bucket labels to codes", () => {
    const result = parseSeedResource(
      aSeed({ buckets: ["Mental Health & Recovery", "Health Care"] }),
    );
    expect(result.ok && result.input.buckets).toEqual(["mental", "health"]);
  });

  it("refuses an unknown bucket instead of dropping it", () => {
    // The failure this prevents: a typo becoming `[]`, which reads as a valid
    // record on screen and matches nobody forever.
    const result = parseSeedResource(aSeed({ buckets: ["Mental Health"] }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain("Mental Health");
  });

  it("reads a locality out of the service area when none is given", () => {
    const result = parseSeedResource(
      aSeed({ service_area: "Local (Chattanooga area)", states: "TN" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.geoScope).toBe("local");
    expect(result.input.geoStates).toEqual(["TN"]);
    expect(result.input.geoLocalities).toEqual(["Chattanooga"]);
    expect(result.warnings.join(" ")).toContain("Chattanooga");
  });

  it("prefers an explicit localities field over the parenthetical", () => {
    const result = parseSeedResource(
      aSeed({
        service_area: "Local (Chattanooga area)",
        states: "TN",
        localities: "Chattanooga, East Ridge",
      }),
    );
    expect(result.ok && result.input.geoLocalities).toEqual([
      "Chattanooga",
      "East Ridge",
    ]);
  });

  it("rejects a local record with no state", () => {
    const result = parseSeedResource(
      aSeed({ service_area: "Local (Chattanooga area)", states: "" }),
    );
    expect(result.ok).toBe(false);
  });

  it("drops states on a national record rather than half-scoping it", () => {
    const result = parseSeedResource(
      aSeed({ service_area: "National", states: "TN" }),
    );
    expect(result.ok && result.input.geoStates).toEqual([]);
  });

  it("reads a wait range as its slower end and says so", () => {
    // Ranking rewards a short wait. Guessing short moves a resource up the
    // list on a promise nobody made.
    const result = parseSeedResource(
      aSeed({ typical_wait: "Weeks to months (waitlist)" }),
    );
    expect(result.ok && result.input.typicalWait).toBe("months");
    expect(result.ok && result.warnings.join(" ")).toContain("slower end");
  });

  it("reads 'None (24/7, immediate)' as same day", () => {
    const result = parseSeedResource(
      aSeed({ typical_wait: "None (24/7, immediate)" }),
    );
    expect(result.ok && result.input.typicalWait).toBe("sameday");
  });

  it("refuses an unrecognized wait rather than calling it unknown", () => {
    // "unknown" means nobody established it. A typo must not impersonate that.
    const result = parseSeedResource(aSeed({ typical_wait: "soonish" }));
    expect(result.ok).toBe(false);
  });

  it("maps an app download to web, since there's no app access method", () => {
    const result = parseSeedResource(
      aSeed({ access_method: "App download (free)" }),
    );
    expect(result.ok && result.input.accessMethod).toBe("web");
  });

  it("turns requirement labels into gates, and leaves the rest permissive", () => {
    const result = parseSeedResource(
      aSeed({ reqs: ["Same-day / crisis capable"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.crisisCapable).toBe(true);
    expect(result.input.requiresVaEnrollment).toBe(false);
    expect(result.input.requiresValidId).toBe(false);
    expect(result.input.requiresDependents).toBe(false);
  });

  it("carries eligibility notes through untouched", () => {
    const notes =
      "Combat theater service and military sexual trauma both qualify.";
    const result = parseSeedResource(aSeed({ elig_notes: notes }));
    expect(result.ok && result.input.eligibilityNotes).toBe(notes);
  });

  it("honours the status in the file", () => {
    expect(parseSeedResource(aSeed({ status: "Live" })).ok).toBe(true);
    const live = parseSeedResource(aSeed({ status: "Live" }));
    expect(live.ok && live.input.verificationStatus).toBe("live");
    const flagged = parseSeedResource(aSeed({ status: "Flagged" }));
    expect(flagged.ok && flagged.input.verificationStatus).toBe("flagged");
  });

  it("flags a record with no status rather than assuming somebody checked", () => {
    const result = parseSeedResource(aSeed({ status: undefined }));
    expect(result.ok && result.input.verificationStatus).toBe("flagged");
  });

  it("collects every problem in one pass", () => {
    const result = parseSeedResource(
      aSeed({ buckets: ["Nope"], typical_wait: "soonish", status: "Alive" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toHaveLength(3);
  });

  it("warns rather than fails when a record has no buckets", () => {
    const result = parseSeedResource(aSeed({ buckets: [] }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings.join(" ")).toContain("match nobody");
  });
});

describe("seedExternalId", () => {
  it("is stable, so a second load updates instead of duplicating", () => {
    expect(seedExternalId("Chattanooga Vet Center")).toBe(
      "seed:chattanooga-vet-center",
    );
    expect(seedExternalId("Beyond MST (mobile app)")).toBe(
      "seed:beyond-mst-mobile-app",
    );
  });
});

describe("the checked-in seed file", () => {
  // The file is the roster's starting point. If it stops mapping cleanly,
  // that's worth knowing here rather than on the next load.
  const file = JSON.parse(
    readFileSync("data/resources-seed.json", "utf8"),
  ) as { resources: SeedResource[] };

  it("maps every record and passes the form's own validation", () => {
    for (const raw of file.resources) {
      const mapped = parseSeedResource(raw);
      expect(mapped.ok, `${raw.org_name}: ${JSON.stringify(mapped)}`).toBe(true);
      if (!mapped.ok) continue;
      const validated = resourceInputSchema.safeParse(mapped.input);
      expect(
        validated.success,
        `${raw.org_name}: ${JSON.stringify(validated.error?.issues)}`,
      ).toBe(true);
    }
  });

  it("gives every record at least one bucket, or it matches nobody", () => {
    for (const raw of file.resources) {
      const mapped = parseSeedResource(raw);
      expect(mapped.ok && mapped.input.buckets.length).toBeGreaterThan(0);
    }
  });
});
