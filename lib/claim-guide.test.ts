import { describe, expect, it } from "vitest";
import { claimGuideHref, claimGuideMessage } from "./claim-guide";

const GUIDE = "https://example.com/guide.pdf";

describe("claimGuideHref", () => {
  it("builds a prefilled sms link for phone contacts", () => {
    const href = claimGuideHref(
      { firstName: "Sam", preferredContact: "phone", phone: "(423) 555-0100" },
      GUIDE,
    );
    expect(href).toBe(
      `sms:4235550100?&body=${encodeURIComponent(claimGuideMessage("Sam", GUIDE))}`,
    );
  });

  it("keeps a leading + on the number", () => {
    const href = claimGuideHref(
      { firstName: "Sam", preferredContact: "phone", phone: "+1 423-555-0100" },
      GUIDE,
    );
    expect(href?.startsWith("sms:+14235550100?")).toBe(true);
  });

  it("builds a mailto link for email contacts", () => {
    const href = claimGuideHref(
      { firstName: "Sam", preferredContact: "email", email: "sam@example.com" },
      GUIDE,
    );
    expect(href?.startsWith("mailto:sam@example.com?subject=")).toBe(true);
    expect(href).toContain(encodeURIComponent(GUIDE));
  });

  it("returns null without a guide url or contact", () => {
    expect(
      claimGuideHref({ firstName: "Sam", preferredContact: "phone", phone: "4235550100" }, ""),
    ).toBeNull();
    expect(
      claimGuideHref({ firstName: "Sam", preferredContact: "phone", phone: "" }, GUIDE),
    ).toBeNull();
    expect(
      claimGuideHref({ firstName: "Sam", preferredContact: "email" }, GUIDE),
    ).toBeNull();
  });
});
