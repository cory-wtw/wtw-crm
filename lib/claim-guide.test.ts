import { describe, expect, it } from "vitest";
import { claimGuideMessage, claimGuideSend, eight00Url } from "./claim-guide";

const GUIDE = "https://example.com/guide.pdf";

describe("claimGuideSend", () => {
  it("opens the veteran's 800.com thread for phone contacts", () => {
    expect(
      claimGuideSend(
        {
          firstName: "Sam",
          preferredContact: "phone",
          phone: "4235550100",
          eight00ThreadId: "abc123",
        },
        GUIDE,
      ),
    ).toEqual({
      kind: "eight00",
      message: claimGuideMessage("Sam", GUIDE),
      url: eight00Url("abc123"),
    });
  });

  it("falls back to the 800.com inbox when no thread is linked", () => {
    const send = claimGuideSend(
      { firstName: "Sam", preferredContact: "phone", phone: "4235550100" },
      GUIDE,
    );
    expect(send).toMatchObject({ kind: "eight00", url: eight00Url() });
  });

  it("builds a mailto link for email contacts", () => {
    const send = claimGuideSend(
      { firstName: "Sam", preferredContact: "email", email: "sam@example.com" },
      GUIDE,
    );
    expect(send?.kind).toBe("email");
    if (send?.kind !== "email") return;
    expect(send.href.startsWith("mailto:sam@example.com?subject=")).toBe(true);
    expect(send.href).toContain(encodeURIComponent(GUIDE));
  });

  it("returns null without a guide url or contact", () => {
    expect(
      claimGuideSend({ firstName: "Sam", preferredContact: "phone", phone: "4235550100" }, ""),
    ).toBeNull();
    expect(
      claimGuideSend({ firstName: "Sam", preferredContact: "phone", phone: "" }, GUIDE),
    ).toBeNull();
    expect(
      claimGuideSend({ firstName: "Sam", preferredContact: "email" }, GUIDE),
    ).toBeNull();
  });
});
