import { describe, expect, it } from "vitest";
import {
  couldNotFind,
  draftKeyFor,
  draftSourceLabel,
  draftToForm,
  pickFollowLinks,
  possibleDuplicates,
  splitPaste,
} from "./quick-add";

describe("splitPaste", () => {
  it("treats a bare link as a link with no text", () => {
    expect(splitPaste("  https://example.org/services/  ")).toEqual({
      url: "https://example.org/services",
      text: "",
    });
  });

  it("accepts a link pasted without the scheme", () => {
    expect(splitPaste("example.org/help").url).toBe("https://example.org/help");
  });

  it("keeps the text and pulls out the first link when both are pasted", () => {
    const paste = "Food pantry Tuesdays. Call 423-555-0100. More at https://example.org/pantry.";
    const { url, text } = splitPaste(paste);
    expect(url).toBe("https://example.org/pantry");
    expect(text).toBe(paste);
  });

  it("treats plain notes as text only", () => {
    expect(splitPaste("Met Jan at the expo, they do rent help")).toEqual({
      url: null,
      text: "Met Jan at the expo, they do rent help",
    });
  });
});

describe("pickFollowLinks", () => {
  it("takes at most two contact, services, or eligibility pages", () => {
    const picked = pickFollowLinks([
      { url: "https://x.org/donate", text: "Donate" },
      { url: "https://x.org/contact", text: "Contact us" },
      { url: "https://x.org/eligibility", text: "Who is eligible" },
      { url: "https://x.org/services", text: "Our services" },
      { url: "https://x.org/news", text: "News" },
    ]);
    expect(picked).toEqual(["https://x.org/eligibility", "https://x.org/services"]);
  });

  it("ignores the host, which every link shares", () => {
    expect(
      pickFollowLinks([{ url: "https://veteranservices.org/about", text: "About" }]),
    ).toEqual([]);
    expect(
      pickFollowLinks([
        { url: "https://volunteerbehavioralhealth.org/contact-us", text: "Contact Us" },
      ]),
    ).toEqual(["https://volunteerbehavioralhealth.org/contact-us"]);
  });

  it("skips pages that aren't about contact, services, or eligibility", () => {
    expect(
      pickFollowLinks([{ url: "https://x.org/about", text: "About" }]),
    ).toEqual([]);
  });
});

describe("draftSourceLabel", () => {
  const today = new Date(2026, 9, 26);

  it("names the site and the date", () => {
    expect(
      draftSourceLabel(
        [
          "https://www.volunteerbehavioralhealth.org/services/x",
          "https://www.volunteerbehavioralhealth.org/contact",
        ],
        false,
        today,
      ),
    ).toBe("volunteerbehavioralhealth.org, drafted Oct 26 2026");
  });

  it("says when pasted text was used", () => {
    expect(draftSourceLabel([], true, today)).toBe(
      "pasted text, drafted Oct 26 2026",
    );
  });
});

describe("draftToForm", () => {
  const SOURCE = "example.org, drafted Oct 26 2026";

  it("maps the importer's vocabulary onto the form and marks what it filled", () => {
    const draft = draftToForm(
      {
        org_name: "Homeless Services",
        phone: "423-486-5278",
        buckets: ["Housing", "Mental Health & Recovery"],
        service_area: "Local",
        states: ["GA"],
        localities: ["Catoosa County", "Dade County", "Walker County"],
        min_discharge: "Any discharge, including other-than-honorable",
        access_method: "Call",
        phone_to_call: "423-486-5278",
        typical_wait: "Unknown",
        fragility: "Fragile",
      },
      SOURCE,
    );

    expect(draft.values).toMatchObject({
      organizationName: "Homeless Services",
      contactPhone: "423-486-5278",
      buckets: ["housing", "mental"],
      geoScope: "local",
      geoStates: "GA",
      geoLocalities: "Catoosa County, Dade County, Walker County",
      minDischarge: "any",
      accessMethod: "phone",
      accessValue: "423-486-5278",
      fragility: "fragile",
      verificationStatus: "flagged",
      sourceName: SOURCE,
    });
    expect(draft.values.typicalWait).toBeUndefined();
    expect(draft.filled).toEqual(
      expect.arrayContaining(["contactPhone", "geoLocalities", "buckets", "sourceName"]),
    );
    expect(draft.filled).not.toContain("typicalWait");
    expect(draft.notes).toEqual([]);
  });

  it("drops what the form can't hold and says so, keeping the rest", () => {
    const draft = draftToForm(
      { org_name: "X", buckets: ["Housing", "Pets"], typical_wait: "Soon" },
      SOURCE,
    );
    expect(draft.values.buckets).toEqual(["housing"]);
    expect(draft.notes).toEqual([
      'Left out bucket "Pets" — not one of the 11.',
      'Left out typical wait "Soon".',
    ]);
  });

  it("leaves every gate alone when the source says nothing", () => {
    const draft = draftToForm({ org_name: "X" }, SOURCE);
    expect(draft.values.requiresVaEnrollment).toBeUndefined();
    expect(draft.values.eraRestriction).toBeUndefined();
    expect(draft.values.minDischarge).toBeUndefined();
    expect(draft.filled).toEqual(["organizationName", "sourceName"]);
  });

  it("maps stated requirements and eras", () => {
    const draft = draftToForm(
      {
        reqs: ["Requires VA enrollment", "Homeless veterans only"],
        eras: ["Post-9/11"],
      },
      SOURCE,
    );
    expect(draft.values.requiresVaEnrollment).toBe(true);
    expect(draft.values.populationRestriction).toEqual(["homeless"]);
    expect(draft.values.eraRestriction).toEqual(["post911"]);
    expect(draft.filled).toEqual(
      expect.arrayContaining(["requirements", "populationRestriction", "eraRestriction"]),
    );
  });

  it("matches a label that has a parenthetical of its own", () => {
    const draft = draftToForm({ eras: ["Pre-9/11 (other)"] }, SOURCE);
    expect(draft.values.eraRestriction).toEqual(["pre911"]);
    expect(draft.notes).toEqual([]);
  });

  it("names states it can't place instead of hiding them under National", () => {
    const draft = draftToForm({ states: ["TN"] }, SOURCE);
    expect(draft.values.geoStates).toBeUndefined();
    expect(draft.filled).not.toContain("geoStates");
    expect(draft.notes).toHaveLength(1);
  });

  it("never takes status or source from the model", () => {
    const draft = draftToForm({ status: "Live", source: "made up" }, SOURCE);
    expect(draft.values.verificationStatus).toBe("flagged");
    expect(draft.values.sourceName).toBe(SOURCE);
  });

  it("ignores localities on a national record", () => {
    const draft = draftToForm(
      { service_area: "National", states: ["TN"], localities: ["Chattanooga"] },
      SOURCE,
    );
    expect(draft.values.geoStates).toBeUndefined();
    expect(draft.values.geoLocalities).toBeUndefined();
  });
});

describe("couldNotFind", () => {
  it("lists phone, eligibility, and counties when they're blank", () => {
    expect(couldNotFind({ geoScope: "local", geoStates: "GA", buckets: ["housing"] })).toEqual([
      "Phone",
      "Eligibility",
      "Counties served",
    ]);
  });

  it("asks for the service area, not counties, when there's no area", () => {
    expect(couldNotFind({ contactPhone: "1", eligibility: "x", buckets: ["housing"] })).toEqual([
      "Service area",
    ]);
  });

  it("is empty when the important fields are there", () => {
    expect(
      couldNotFind({
        contactPhone: "423-486-5278",
        eligibility: "Homeless veterans",
        geoScope: "local",
        geoStates: "GA",
        geoLocalities: "Walker County",
        buckets: ["housing"],
      }),
    ).toEqual([]);
  });
});

describe("draftKeyFor", () => {
  it("groups the requirement checkboxes", () => {
    expect(draftKeyFor("crisisCapable")).toBe("requirements");
    expect(draftKeyFor("buckets")).toBe("buckets");
    expect(draftKeyFor("verificationStatus")).toBeNull();
  });
});

describe("possibleDuplicates", () => {
  const existing = [
    {
      id: "a",
      organizationName: "Volunteer Behavioral Health Care System",
      contactPhone: "(423) 486-5278 or 877-567-6051",
      website: "https://www.vbhcs.org",
    },
    { id: "b", organizationName: "VA Medical Center", website: "https://www.va.gov/chattanooga" },
    { id: "c", organizationName: "Habitat for Humanity" },
  ];

  it("matches on a similar name", () => {
    expect(
      possibleDuplicates({ organizationName: "Volunteer Behavioral Health" }, existing),
    ).toEqual([{ id: "a", organizationName: existing[0].organizationName, reasons: ["similar name"] }]);
  });

  it("matches on the same phone however it's written", () => {
    expect(
      possibleDuplicates({ contactPhone: "423.486.5278" }, existing).map((d) => d.id),
    ).toEqual(["a"]);
  });

  it("matches the same site, but not a different page on a shared one", () => {
    expect(possibleDuplicates({ website: "vbhcs.org/services" }, existing).map((d) => d.id)).toEqual(["a"]);
    expect(possibleDuplicates({ website: "https://www.va.gov/nashville" }, existing)).toEqual([]);
  });

  it("doesn't call two unrelated orgs duplicates", () => {
    expect(possibleDuplicates({ organizationName: "Habitat Restore" }, existing)).toEqual([]);
  });
});
