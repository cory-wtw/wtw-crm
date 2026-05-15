import { describe, expect, it } from "vitest";
import { mapAirtableRowToVeteran } from "./airtable-mapping";

const NOW = new Date(2026, 4, 15);
const SYSTEM = "system-import";

function emptyRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Name: "",
    Phone: "",
    "Birth Year": "",
    "Current Age": "",
    "Life Expectancy at Found": "",
    "Yearly Income": "",
    "Household Size": "",
    Assignee: "",
    "Pipeline Stage": "",
    "Date Found": "",
    "Age at Found": "",
    "Date Connected": "",
    "Dependent Status": "",
    Notes: "",
    "Anticipated Rate": "",
    "Anticipated Monthly Benefit": "",
    "Anticipated Lifetime Benefit": "",
    "Actual Rate": "",
    "Actual Monthly Benefit": "",
    "Actual Lifetime Benefit": "",
    ...overrides,
  };
}

describe("mapAirtableRowToVeteran", () => {
  it("rejects rows with no Name", () => {
    const result = mapAirtableRowToVeteran(emptyRow(), {
      assigneeUidByDisplayName: new Map(),
      now: NOW,
      systemUid: SYSTEM,
    });
    expect(result.ok).toBe(false);
  });

  it("maps Cory's row correctly", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({
        Name: "Cory Gold",
        Phone: "(423) 509-2278",
        "Birth Year": "1996",
        "Life Expectancy at Found": "50",
        "Yearly Income": "$215000",
        "Household Size": "3",
        Assignee: "Cory Gold",
        "Pipeline Stage": "Won",
        "Date Found": "1/1/2020",
        "Age at Found": "24",
        "Date Connected": "2/1/2020",
        Notes: "Founder",
        "Actual Rate": "100-SMCS-SK",
      }),
      {
        assigneeUidByDisplayName: new Map([["cory gold", "uid-cory"]]),
        now: NOW,
        systemUid: SYSTEM,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.veteran.name).toBe("Cory Gold");
    expect(result.veteran.phone).toBe("(423) 509-2278");
    expect(result.veteran.birthYear).toBe(1996);
    expect(result.veteran.lifeExpectancyAtFound).toBe(50);
    expect(result.veteran.yearlyIncome).toBe(215000);
    expect(result.veteran.householdSize).toBe(3);
    expect(result.veteran.assigneeUid).toBe("uid-cory");
    expect(result.veteran.pipelineStage).toBe("won");
    expect(result.veteran.ageAtFound).toBe(24);
    expect(result.veteran.notes).toBe("Founder");
    expect(result.veteran.actualRateCode).toBe("100-SMCS-SK");
    expect(result.veteran.anticipatedRateCode).toBeNull();
    expect(result.warnings).toHaveLength(0);
  });

  it("backfills pipelineHistory from Date Found + Date Connected", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({
        Name: "Cory Gold",
        "Pipeline Stage": "Won",
        "Date Found": "1/1/2020",
        "Date Connected": "2/1/2020",
        Assignee: "Cory Gold",
      }),
      {
        assigneeUidByDisplayName: new Map([["cory gold", "uid-cory"]]),
        now: NOW,
        systemUid: SYSTEM,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stages = result.veteran.pipelineHistory.map((h) => h.stage);
    expect(stages).toEqual(["found", "connected", "won"]);
    expect(result.veteran.pipelineHistory[0].enteredAt.getFullYear()).toBe(
      2020,
    );
    expect(result.veteran.pipelineHistory[2].enteredAt).toEqual(NOW);
  });

  it("stamps dateWon = now when stage is Won and no won date supplied", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "X", "Pipeline Stage": "Won" }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.dateWon).toEqual(NOW);
    expect(result.veteran.dateLost).toBeNull();
  });

  it("stamps dateLost = now when stage is Lost", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "X", "Pipeline Stage": "Lost" }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.dateLost).toEqual(NOW);
    expect(result.veteran.dateWon).toBeNull();
  });

  it("warns when assignee doesn't match any Firebase user", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({
        Name: "Thomas Vollmar",
        "Pipeline Stage": "Found",
        Assignee: "Kristen Shelton",
      }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.assigneeUid).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain("Kristen Shelton");
  });

  it("matches assignees case-insensitively", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "X", Assignee: "Cory Gold" }),
      {
        assigneeUidByDisplayName: new Map([["cory gold", "uid-cory"]]),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.assigneeUid).toBe("uid-cory");
    expect(result.warnings).toHaveLength(0);
  });

  it("defaults unknown pipeline stages to found and warns", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "X", "Pipeline Stage": "Pending" }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.pipelineStage).toBe("found");
    expect(result.warnings.some((w) => w.message.includes("Pending"))).toBe(
      true,
    );
  });

  it("maps dependent status labels", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "X", "Dependent Status": "With Spouse + Kids" }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.dependentStatus).toBe("with_spouse_kids");
  });

  it("leaves optional fields undefined when empty", () => {
    const result = mapAirtableRowToVeteran(
      emptyRow({ Name: "Minimal" }),
      {
        assigneeUidByDisplayName: new Map(),
        now: NOW,
        systemUid: SYSTEM,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.veteran.phone).toBeUndefined();
    expect(result.veteran.birthYear).toBeUndefined();
    expect(result.veteran.yearlyIncome).toBeUndefined();
    expect(result.veteran.notes).toBeUndefined();
    expect(result.veteran.anticipatedRateCode).toBeNull();
    expect(result.veteran.actualRateCode).toBeNull();
  });
});
