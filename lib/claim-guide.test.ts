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

  it("opens Gmail compose from the staff member's account for email contacts", () => {
    const send = claimGuideSend(
      { firstName: "Sam", preferredContact: "email", email: "sam@example.com" },
      GUIDE,
      "cory@worththeirweight.org",
    );
    expect(send?.kind).toBe("email");
    if (send?.kind !== "email") return;
    const url = new URL(send.href);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("sam@example.com");
    expect(url.searchParams.get("authuser")).toBe("cory@worththeirweight.org");
    expect(url.searchParams.get("body")).toBe(claimGuideMessage("Sam", GUIDE));
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
