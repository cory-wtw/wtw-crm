import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The runner reaches Firestore only through enrich-runner's imports, and the
// model only through the SDK. Neither is exercised here: the page and the
// model's reply are canned, so this checks the plumbing between them.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {} }));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const ENTRY = "https://volunteerbehavioralhealth.org/services/specialized-grant-services-homeless-services/";
const filler = "Volunteer Behavioral Health serves people experiencing homelessness. ".repeat(5);
const PAGES: Record<string, string> = {
  "https://volunteerbehavioralhealth.org/services/specialized-grant-services-homeless-services": `
    <html><body><h1>Homeless Services</h1><p>${filler}</p>
    <p>Serving Catoosa, Dade, and Walker counties in Georgia. Call 423-486-5278.</p>
    <a href="/contact-us">Contact Us</a><a href="/donate">Donate</a>
    <a href="/services">Our Services</a><a href="/news">News</a></body></html>`,
  "https://volunteerbehavioralhealth.org/contact-us": `<p>${filler} Main line 877-567-6051.</p>`,
  "https://volunteerbehavioralhealth.org/services": `<p>${filler} Outpatient, crisis.</p>`,
};

describe("draftFromPaste", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const html = PAGES[url];
        return html
          ? new Response(html, { headers: { "content-type": "text/html" } })
          : new Response("", { status: 404 });
      }),
    );
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            org_name: "Volunteer Behavioral Health — Homeless Services",
            phone: "423-486-5278",
            buckets: ["Housing"],
            service_area: "Local",
            states: ["GA"],
            localities: ["Catoosa County", "Dade County", "Walker County"],
            status: "Live",
          }),
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    create.mockReset();
  });

  it("reads the page plus two linked pages and fills the form from the reply", async () => {
    const { draftFromPaste } = await import("./quick-add-runner");
    const outcome = await draftFromPaste(ENTRY, new Date(2026, 9, 26));
    if (!outcome.ok) throw new Error(outcome.error);
    const { result } = outcome;

    expect(result.pagesRead).toEqual([
      "https://volunteerbehavioralhealth.org/services/specialized-grant-services-homeless-services",
      "https://volunteerbehavioralhealth.org/services",
      "https://volunteerbehavioralhealth.org/contact-us",
    ]);

    // The page text, Georgia counties and number included, reached the model.
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Catoosa, Dade, and Walker counties in Georgia");
    expect(prompt).toContain("423-486-5278");
    expect(create.mock.calls[0][0].model).toBe("claude-opus-5-5");

    expect(result.values).toMatchObject({
      contactPhone: "423-486-5278",
      geoScope: "local",
      geoStates: "GA",
      geoLocalities: "Catoosa County, Dade County, Walker County",
      verificationStatus: "flagged",
      sourceName: "volunteerbehavioralhealth.org, drafted Oct 26 2026",
      website:
        "https://volunteerbehavioralhealth.org/services/specialized-grant-services-homeless-services",
    });
    expect(result.missing).toEqual(["Eligibility"]);
  });

  it("drafts from pasted text when there's no link, without fetching", async () => {
    const { draftFromPaste } = await import("./quick-add-runner");
    const outcome = await draftFromPaste("Homeless help in Walker County GA. Call 423-486-5278.");
    expect(outcome.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses without an API key, before fetching anything", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { draftFromPaste } = await import("./quick-add-runner");
    const outcome = await draftFromPaste(ENTRY);
    expect(outcome.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
