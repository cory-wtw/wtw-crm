import { describe, expect, it } from "vitest";
import {
  tidyEmail,
  tidyName,
  tidyPhones,
  tidyResource,
  tidyState,
  tidyWebsite,
  tidyZip,
} from "./tidy";

describe("tidyPhones", () => {
  it("puts every number in one shape", () => {
    for (const raw of ["(423) 855-6570", "423.855.6570", "4238556570", "+1 423 855 6570", "1-423-855-6570"]) {
      expect(tidyPhones(raw)).toBe("423-855-6570");
    }
  });

  it("formats numbers inside instructions and leaves the words", () => {
    expect(tidyPhones("(423) 855 6570 (local) or 1 877 927 8387 (24/7)")).toBe(
      "423-855-6570 (local) or 877-927-8387 (24/7)",
    );
    expect(tidyPhones("Dial 211 and ask for housing")).toBe("Dial 211 and ask for housing");
  });
});

describe("the rest", () => {
  it("emails", () => expect(tidyEmail("  Cory@WorthTheirWeight.org ")).toBe("cory@worththeirweight.org"));
  it("websites", () => {
    expect(tidyWebsite("WWW.Example.org/Apply/")).toBe("https://www.example.org/Apply");
    expect(tidyWebsite("http://va.gov")).toBe("http://va.gov");
    expect(tidyWebsite("see their Facebook page")).toBe("see their Facebook page");
  });
  it("states", () => {
    expect(tidyState("georgia")).toBe("GA");
    expect(tidyState("tn")).toBe("TN");
  });
  it("ZIPs", () => expect(tidyZip("30741-1234")).toBe("30741"));
  it("names only when typed all one case", () => {
    expect(tidyName("ROSSVILLE")).toBe("Rossville");
    expect(tidyName("fort oglethorpe")).toBe("Fort Oglethorpe");
    expect(tidyName("LaFayette")).toBe("LaFayette");
  });
  it("resource lists", () => {
    expect(tidyResource({ geoStates: ["ga"], geoLocalities: ["walker county"] })).toEqual({
      geoStates: ["GA"],
      geoLocalities: ["Walker County"],
    });
  });
});
