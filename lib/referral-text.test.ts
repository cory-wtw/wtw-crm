import { describe, expect, it } from "vitest";
import {
  buildReferralPacket,
  buildReferralText,
  describeResource,
  screenForPacket,
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

describe("screenForPacket", () => {
  it("names the pattern and the words that tripped it", () => {
    expect(screenForPacket("Grants of up to $1,200 for rent.")).toEqual({
      pattern: "money",
      match: "$1,200",
    });
    expect(screenForPacket("We guarantee you get seen")).toEqual({
      pattern: "outcome-or-claim",
      match: "guarantee",
    });
  });

  it("returns null for text that can go in front of a veteran", () => {
    expect(screenForPacket("Food pantry open Tuesdays.")).toBeNull();
  });
});

describe("describeResource", () => {
  it("uses the record's own words when they're safe", () => {
    const result = describeResource({
      description: "Runs a food pantry on Tuesdays.",
    });
    expect(result.line).toBe("Runs a food pantry on Tuesdays.");
    expect(result.trip).toBeNull();
  });

  it("falls back to services when there's no description", () => {
    expect(
      describeResource({ description: null, services: "Rent help, utilities" })
        .line,
    ).toBe("Rent help, utilities");
  });

  it("replaces a line carrying a dollar figure rather than editing it", () => {
    // A half-redacted sentence reads like it still means something specific.
    const result = describeResource({
      description: "Grants of up to $1,200 for rent.",
      services: "Rent assistance",
    });
    expect(result.line).toBe("Rent assistance");
    expect(result.line).not.toContain("$");
  });

  it("reports the bad description even when a safe fallback was found", () => {
    // The description is a bad record wherever it appears, not just here.
    const result = describeResource({
      description: "Grants of up to $1,200 for rent.",
      services: "Rent assistance",
    });
    expect(result.trip).toEqual({
      pattern: "money",
      match: "$1,200",
      field: "description",
    });
  });

  it("falls back to neutral when every candidate is unsafe", () => {
    const result = describeResource({
      description: "We guarantee approval.",
      services: "Gets you $2,000 back pay",
    });
    expect(result.line).toBe("Ask them what they can help with.");
    expect(result.trip).not.toBeNull();
  });

  it("falls back to neutral when there's nothing on file", () => {
    const result = describeResource({});
    expect(result.line).toBe("Ask them what they can help with.");
    expect(result.trip).toBeNull();
  });
});

describe("buildReferralPacket substitutions", () => {
  it("reports nothing when every record is clean", () => {
    const packet = buildReferralPacket({
      firstName: "John",
      resources: [aPacketResource()],
    });
    expect(packet.substitutions).toEqual([]);
  });

  it("names the resource, field, pattern, and matched words", () => {
    const packet = buildReferralPacket({
      firstName: "John",
      resources: [
        aPacketResource({
          organizationName: "Rent Fund",
          description: "Grants of up to $1,200 for rent.",
          services: null,
        }),
      ],
    });
    expect(packet.substitutions).toEqual([
      {
        resourceIndex: 0,
        organizationName: "Rent Fund",
        field: "description",
        pattern: "money",
        match: "$1,200",
      },
    ]);
  });

  it("reports a dropped what-to-bring line separately", () => {
    const packet = buildReferralPacket({
      firstName: "John",
      resources: [
        aPacketResource({ whatToBring: "Bring $25 for the application fee" }),
      ],
    });
    expect(packet.text).not.toContain("Bring:");
    expect(packet.substitutions).toHaveLength(1);
    expect(packet.substitutions[0].field).toBe("whatToBring");
  });

  it("keeps the index so staff can find the entry in the packet", () => {
    const packet = buildReferralPacket({
      firstName: "John",
      resources: [
        aPacketResource(),
        aPacketResource({
          organizationName: "Second",
          description: "We guarantee approval.",
          services: null,
        }),
      ],
    });
    expect(packet.substitutions[0].resourceIndex).toBe(1);
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
