import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  htmlToText,
  isBlockedHost,
  MAX_PAGE_CHARS,
  normalizeUrl,
  parseProposal,
  parseUrlList,
  unansweredFields,
} from "./enrich";

describe("htmlToText", () => {
  it("drops script and style contents", () => {
    const text = htmlToText(
      "<p>Kept</p><script>var secret = 1;</script><style>.a{color:red}</style>",
    );
    expect(text).toContain("Kept");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("color:red");
  });

  it("keeps block boundaries so headings don't fuse into sentences", () => {
    const text = htmlToText("<h1>Rent Help</h1><p>Open Tuesdays.</p>");
    expect(text).toBe("Rent Help\nOpen Tuesdays.");
  });

  it("decodes the entities that actually turn up", () => {
    expect(htmlToText("<p>Food &amp; clothing&nbsp;help</p>")).toBe(
      "Food & clothing help",
    );
  });

  it("caps very long pages", () => {
    const text = htmlToText(`<p>${"word ".repeat(20_000)}</p>`);
    expect(text.length).toBeLessThanOrEqual(MAX_PAGE_CHARS + 2);
  });

  it("survives markup that isn't really HTML", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("plain text")).toBe("plain text");
  });
});

describe("extractJsonObject", () => {
  it("parses bare JSON", () => {
    expect(extractJsonObject('{"name":"MASH"}')).toEqual({ name: "MASH" });
  });

  it("strips code fences", () => {
    expect(extractJsonObject('```json\n{"name":"MASH"}\n```')).toEqual({
      name: "MASH",
    });
    expect(extractJsonObject('```\n{"name":"MASH"}\n```')).toEqual({
      name: "MASH",
    });
  });

  it("skips a preamble and a sign-off", () => {
    expect(
      extractJsonObject('Here is the JSON:\n{"name":"MASH"}\nHope that helps!'),
    ).toEqual({ name: "MASH" });
  });

  it("does not truncate on a brace inside a string", () => {
    const parsed = extractJsonObject('{"description":"Use form {A} first"}');
    expect(parsed).toEqual({ description: "Use form {A} first" });
  });

  it("handles nested objects", () => {
    expect(extractJsonObject('{"a":{"b":1},"c":2}')).toEqual({
      a: { b: 1 },
      c: 2,
    });
  });

  it("returns null for junk rather than throwing", () => {
    expect(extractJsonObject("I can't help with that.")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("{not json at all")).toBeNull();
  });
});

describe("parseProposal", () => {
  const full = {
    name: "MASH",
    parentOrg: null,
    description: "Emergency housing.",
    buckets: ["housing"],
    geoScope: "state",
    geoStates: ["TN"],
    geoLocalities: [],
    minDischarge: "any",
    requiresVaEnrollment: false,
    requiresValidId: false,
    eraRestriction: [],
    requiresDependents: false,
    crisisCapable: true,
    accessMethod: "phone",
    accessValue: "555-0100",
    whatToBring: null,
    typicalWait: "days",
  };

  it("accepts a complete proposal", () => {
    expect(parseProposal(JSON.stringify(full))).toMatchObject({
      name: "MASH",
      buckets: ["housing"],
      crisisCapable: true,
    });
  });

  it("keeps nulls as nulls rather than defaulting them", () => {
    // The whole point: unanswered has to stay distinguishable from "no".
    const parsed = parseProposal(JSON.stringify(full));
    expect(parsed!.whatToBring).toBeNull();
    expect(parsed!.parentOrg).toBeNull();
  });

  it("degrades a bad field to unanswered instead of failing the proposal", () => {
    const parsed = parseProposal(
      JSON.stringify({
        ...full,
        minDischarge: "probably honorable",
        requiresValidId: "maybe",
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.minDischarge).toBeNull();
    expect(parsed!.requiresValidId).toBeNull();
    // …and the fields that were fine survive.
    expect(parsed!.name).toBe("MASH");
  });

  it("drops an invented bucket code", () => {
    const parsed = parseProposal(
      JSON.stringify({ ...full, buckets: ["housing", "kittens"] }),
    );
    expect(parsed!.buckets).toBeNull();
  });

  it("returns null when there's no JSON at all", () => {
    expect(parseProposal("I could not read that page.")).toBeNull();
  });

  it("fills missing keys with null", () => {
    const parsed = parseProposal('{"name":"MASH"}');
    expect(parsed!.description).toBeNull();
    expect(parsed!.crisisCapable).toBeNull();
  });
});

describe("unansweredFields", () => {
  it("names every field the page didn't answer", () => {
    const parsed = parseProposal('{"name":"MASH","buckets":["housing"]}')!;
    const unanswered = unansweredFields(parsed);
    expect(unanswered).toContain("crisisCapable");
    expect(unanswered).toContain("accessValue");
    expect(unanswered).not.toContain("name");
  });
});

describe("normalizeUrl", () => {
  it("lowercases the host and drops the fragment and trailing slash", () => {
    expect(normalizeUrl("HTTPS://Example.ORG/help/#section")).toBe(
      "https://example.org/help",
    );
  });

  it("drops a default port", () => {
    expect(normalizeUrl("https://example.org:443/help")).toBe(
      "https://example.org/help",
    );
  });

  it("keeps the query string", () => {
    expect(normalizeUrl("https://example.org/find?id=7")).toBe(
      "https://example.org/find?id=7",
    );
  });

  it("rejects anything that isn't http(s)", () => {
    for (const input of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(normalizeUrl(input)).toBeNull();
    }
  });
});

describe("isBlockedHost", () => {
  it("blocks the cloud metadata endpoint", () => {
    // On Cloud Run this would put instance credentials into a model prompt.
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("metadata.google.internal")).toBe(true);
  });

  it("blocks loopback and private ranges", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "192.168.1.1",
      "::1",
    ]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  it("blocks bare IP literals generally", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(true);
  });

  it("allows ordinary hostnames", () => {
    for (const host of ["example.org", "www.va.gov", "mash-chattanooga.org"]) {
      expect(isBlockedHost(host)).toBe(false);
    }
  });
});

describe("parseUrlList", () => {
  it("splits on newlines and commas, normalizing as it goes", () => {
    const { urls } = parseUrlList(
      "https://a.org/x\n https://B.org/y/ ,https://c.org",
    );
    expect(urls).toEqual([
      "https://a.org/x",
      "https://b.org/y",
      "https://c.org",
    ]);
  });

  it("de-duplicates the same page pasted twice", () => {
    const { urls } = parseUrlList(
      "https://a.org/x\nhttps://a.org/x/\nhttps://A.org/x#top",
    );
    expect(urls).toEqual(["https://a.org/x"]);
  });

  it("reports what it couldn't read rather than dropping it silently", () => {
    const { urls, invalid } = parseUrlList("https://a.org\nnot-a-url\n");
    expect(urls).toEqual(["https://a.org"]);
    expect(invalid).toEqual(["not-a-url"]);
  });
});
