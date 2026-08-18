import { describe, expect, it } from "vitest";
import {
  buildReferralText,
  describeResource,
  firstSentence,
  isUnsafeForPacket,
  startLine,
  type PacketResource,
} from "./referral-text";

function aPacketResource(
  overrides: Partial<PacketResource> = {},
): PacketResource {
  return {
    organizationName: "Chattanooga Vet Center",
    description: "Counseling and peer support for veterans and their families.",
    services: "Counseling, peer groups",
    accessMethod: "walkin",
    accessValue: "951 Eastgate Loop, Chattanooga TN",
    whatToBring: "Photo ID if you have one",
    ...overrides,
  };
}

describe("isUnsafeForPacket", () => {
  it("catches money in the shapes staff actually types", () => {
    for (const text of [
      "Up to $1,200 in rent help",
      "Grants of $500",
      "They give 300 dollars a month",
      "$50/mo utility credit",
    ]) {
      expect(isUnsafeForPacket(text)).toBe(true);
    }
  });

  it("catches outcome promises and claim advice", () => {
    for (const text of [
      "We guarantee you get seen",
      "They'll get your claim approved",
      "You will receive help within a week",
      "Helps you file a claim for hearing loss",
      "You're entitled to a higher rating",
    ]) {
      expect(isUnsafeForPacket(text)).toBe(true);
    }
  });

  it("passes ordinary descriptions", () => {
    for (const text of [
      "Counseling and peer support for veterans and their families.",
      "Food pantry open Tuesdays and Thursdays.",
      "Helps with transportation to medical appointments.",
    ]) {
      expect(isUnsafeForPacket(text)).toBe(false);
    }
  });
});

describe("firstSentence", () => {
  it("takes the first sentence and collapses whitespace", () => {
    expect(firstSentence("One thing.  Then another.")).toBe("One thing.");
    expect(firstSentence("Wrapped\n  text here")).toBe("Wrapped text here");
  });

  it("truncates something long with no sentence break", () => {
    const long = "word ".repeat(80);
    const result = firstSentence(long, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(firstSentence("   ")).toBe("");
  });
});

describe("describeResource", () => {
  it("uses the record's own words when they're safe", () => {
    expect(
      describeResource({ description: "Runs a food pantry on Tuesdays." }),
    ).toBe("Runs a food pantry on Tuesdays.");
  });

  it("falls back to services when there's no description", () => {
    expect(
      describeResource({ description: null, services: "Rent help, utilities" }),
    ).toBe("Rent help, utilities");
  });

  it("replaces a line carrying a dollar figure rather than editing it", () => {
    // A half-redacted sentence reads like it still means something specific.
    const result = describeResource({
      description: "Grants of up to $1,200 for rent.",
      services: "Rent assistance",
    });
    expect(result).toBe("Rent assistance");
    expect(result).not.toContain("$");
  });

  it("falls back to neutral when every candidate is unsafe", () => {
    const result = describeResource({
      description: "We guarantee approval.",
      services: "Gets you $2,000 back pay",
    });
    expect(result).toBe("Ask them what they can help with.");
  });

  it("falls back to neutral when there's nothing on file", () => {
    expect(describeResource({})).toBe("Ask them what they can help with.");
  });
});

describe("startLine", () => {
  it("phrases each access method as something to do", () => {
    expect(
      startLine(aPacketResource({ accessMethod: "phone", accessValue: "555-0100" })),
    ).toBe("Call 555-0100.");
    expect(
      startLine(
        aPacketResource({ accessMethod: "web", accessValue: "example.org/apply" }),
      ),
    ).toContain("Apply online");
    expect(startLine(aPacketResource({ accessMethod: "walkin" }))).toContain(
      "Walk in",
    );
    expect(
      startLine(aPacketResource({ accessMethod: "referral", accessValue: null })),
    ).toContain("referrals only");
  });

  it("still says something useful with no access value on file", () => {
    for (const accessMethod of ["phone", "web", "walkin", "referral"] as const) {
      const line = startLine(
        aPacketResource({ accessMethod, accessValue: null }),
      );
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain("null");
      expect(line).not.toContain("undefined");
    }
  });
});

describe("buildReferralText", () => {
  const packet = () =>
    buildReferralText({
      firstName: "John",
      resources: [
        aPacketResource(),
        aPacketResource({
          organizationName: "Hamilton County Housing",
          description: "Helps with rent and utility bills.",
          accessMethod: "phone",
          accessValue: "555-0142",
          whatToBring: "DD-214, proof of address",
        }),
      ],
    });

  it("greets by first name and lists every resource in order", () => {
    const text = packet();
    expect(text.startsWith("John,")).toBe(true);
    expect(text).toContain("1. Chattanooga Vet Center");
    expect(text).toContain("2. Hamilton County Housing");
  });

  it("gives each one what they do, how to start, and what to bring", () => {
    const text = packet();
    expect(text).toContain("What they do:");
    expect(text).toContain("How to start: Call 555-0142.");
    expect(text).toContain("Bring: DD-214, proof of address");
  });

  it("says we'll check back in two weeks", () => {
    expect(packet()).toContain(
      "We'll check back with you in two weeks to see how these went.",
    );
  });

  it("contains no dollar figure even when the records do", () => {
    const text = buildReferralText({
      firstName: "John",
      resources: [
        aPacketResource({
          description: "Grants of up to $1,200 for rent.",
          services: "Emergency rent help of $500",
          whatToBring: "Bring $25 for the application fee",
        }),
      ],
    });
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\d+\s*dollars/i);
  });

  it("makes no promise about an outcome or a claim", () => {
    const text = buildReferralText({
      firstName: "John",
      resources: [
        aPacketResource({
          description: "We guarantee your claim gets approved.",
          services: "Helps you file a claim for back pay",
          whatToBring: "Your denied rating letter",
        }),
      ],
    });
    expect(text).not.toMatch(/guarantee/i);
    expect(text).not.toMatch(/approved/i);
    expect(text).not.toMatch(/file a claim/i);
    expect(text).not.toMatch(/back ?pay/i);
    expect(text).not.toMatch(/rating/i);
  });

  it("handles a veteran with no first name on file", () => {
    const text = buildReferralText({
      firstName: "",
      resources: [aPacketResource()],
    });
    expect(text.startsWith("Hello,")).toBe(true);
  });

  it("reads correctly for a single resource", () => {
    const text = buildReferralText({
      firstName: "John",
      resources: [aPacketResource()],
    });
    expect(text).toContain("Here's the organization we talked about.");
  });

  it("carries the standing disclaimer", () => {
    expect(packet()).toContain("is not a law firm");
  });
});
