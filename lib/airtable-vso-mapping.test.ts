import { describe, expect, it } from "vitest";
import { mapAirtableRowToVso } from "./airtable-vso-mapping";

function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "Full Name": "",
    Affiliation: "",
    City: "",
    State: "",
    "Direct Phone": "",
    "Direct Email": "",
    "Preferred Contact Method": "",
    "Partnership Status": "",
    Notes: "",
    ...overrides,
  };
}

describe("mapAirtableRowToVso", () => {
  it("rejects rows with no Full Name", () => {
    const result = mapAirtableRowToVso(row());
    expect(result.ok).toBe(false);
  });

  it("maps James Patterson correctly", () => {
    const result = mapAirtableRowToVso(
      row({
        "Full Name": "James Patterson",
        Affiliation: "TN VSO",
        City: "Dunlap",
        State: "TN",
        "Direct Phone": "(423) 949-4660",
        "Direct Email": "jpsqcvso@bledsoe.net",
        "Partnership Status": "Active Partner",
        Notes: "Spoke on the phone, says he is happy to help in any way he can.",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vso.fullName).toBe("James Patterson");
    expect(result.vso.affiliation).toBe("TN VSO");
    expect(result.vso.city).toBe("Dunlap");
    expect(result.vso.state).toBe("TN");
    expect(result.vso.directPhone).toBe("(423) 949-4660");
    expect(result.vso.directEmail).toBe("jpsqcvso@bledsoe.net");
    expect(result.vso.partnershipStatus).toBe("active_partner");
    expect(result.vso.notes).toContain("happy to help");
    expect(result.warnings).toHaveLength(0);
  });

  it("maps every known partnership status", () => {
    const cases: [string, string][] = [
      ["Active Partner", "active_partner"],
      ["In Discussion", "in_discussion"],
      ["Inactive", "inactive"],
      ["Declined", "declined"],
    ];
    for (const [label, expected] of cases) {
      const result = mapAirtableRowToVso(
        row({ "Full Name": "X", "Partnership Status": label }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.vso.partnershipStatus).toBe(expected);
    }
  });

  it("defaults unknown partnership statuses to in_discussion and warns", () => {
    const result = mapAirtableRowToVso(
      row({ "Full Name": "X", "Partnership Status": "Maybe" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vso.partnershipStatus).toBe("in_discussion");
    expect(result.warnings.some((w) => w.message.includes("Maybe"))).toBe(
      true,
    );
  });

  it("leaves optional fields undefined when empty", () => {
    const result = mapAirtableRowToVso(row({ "Full Name": "Minimal" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vso.affiliation).toBeUndefined();
    expect(result.vso.city).toBeUndefined();
    expect(result.vso.directEmail).toBeUndefined();
    expect(result.vso.notes).toBeUndefined();
  });
});
