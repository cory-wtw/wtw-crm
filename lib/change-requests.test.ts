import { describe, expect, it } from "vitest";
import {
  buildResourceInput,
  driftedFields,
  planResourceCreate,
  planResourceUpdate,
  planTransactionCreate,
  planTransactionUpdate,
  planEncounterCreate,
  planVeteranCreate,
  planVeteranUpdate,
  planVsoCreate,
  planVsoUpdate,
  veteranLabel,
  veteranSnapshot,
} from "./change-requests";
import { isExpired } from "./schemas";

const stored = {
  firstName: "Maria",
  lastInitial: "G",
  preferredContact: "phone",
  phone: "(423) 555-0100",
  city: "Chattanooga",
  state: "TN",
  pipelineStage: "found",
  pipelineHistory: [{ stage: "found" }],
  monthlyBenefitBefore: 0,
  monthlyBenefitAfter: 0,
  vsoIds: [],
  createdBy: "u1",
};

describe("planVeteranUpdate", () => {
  it("diffs only the fields the patch names, with before and after", () => {
    const plan = planVeteranUpdate(stored, { city: "Cleveland", pipelineStage: "connected" });
    expect(plan).toEqual({
      ok: true,
      changes: {
        city: { before: "Chattanooga", after: "Cleveland" },
        pipelineStage: { before: "found", after: "connected" },
      },
    });
  });

  it("tidies the way the edit form does", () => {
    const plan = planVeteranUpdate(stored, { state: "georgia" });
    expect(plan.ok && plan.changes.state.after).toBe("GA");
  });

  it("refuses fields the edit form can't set", () => {
    const plan = planVeteranUpdate(stored, { pipelineHistory: [], createdBy: "x" });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error).toMatch(/Not editable: pipelineHistory, createdBy/);
  });

  it("validates the whole record, not just the patch", () => {
    const plan = planVeteranUpdate(stored, { preferredContact: "email" });
    expect(!plan.ok && plan.error).toMatch(/email/);
  });

  it("refuses bad enum values", () => {
    expect(planVeteranUpdate(stored, { pipelineStage: "done" }).ok).toBe(false);
  });

  it("refuses a no-op", () => {
    expect(planVeteranUpdate(stored, { city: "Chattanooga" })).toEqual({
      ok: false,
      error: "That's already what the record says.",
    });
  });

  it("clears an eligibility key with null", () => {
    const plan = planVeteranUpdate({ ...stored, idStatus: "valid" }, { idStatus: null });
    expect(plan).toEqual({ ok: true, changes: { idStatus: { before: "valid", after: null } } });
  });

  it("is reproducible from its own after-values, which is how approval re-checks it", () => {
    const plan = planVeteranUpdate(stored, { city: "cleveland", birthYear: 1970 });
    if (!plan.ok) throw new Error(plan.error);
    const after = Object.fromEntries(Object.entries(plan.changes).map(([k, c]) => [k, c.after]));
    expect(planVeteranUpdate(stored, after)).toEqual(plan);
  });
});

describe("planVeteranCreate", () => {
  it("lists the set fields only", () => {
    const plan = planVeteranCreate({ firstName: "sam", phone: "4235550101" });
    if (!plan.ok) throw new Error(plan.error);
    expect(Object.keys(plan.changes).sort()).toEqual(
      ["firstName", "phone", "pipelineStage", "preferredContact", "monthlyBenefitBefore", "monthlyBenefitAfter"].sort(),
    );
    expect(plan.changes.firstName).toEqual({ before: null, after: "Sam" });
  });

  it("needs a first name and the preferred channel", () => {
    expect(planVeteranCreate({ phone: "4235550101" }).ok).toBe(false);
    expect(planVeteranCreate({ firstName: "Sam" }).ok).toBe(false);
  });

  it("refuses never-stored fields", () => {
    const plan = planVeteranCreate({ firstName: "Sam", phone: "1", lastName: "Smith" });
    expect(!plan.ok && plan.error).toMatch(/Unknown fields: lastName/);
  });
});

describe("VSOs", () => {
  it("plans a create and an update", () => {
    expect(planVsoCreate({ fullName: "Jane Doe", affiliation: "DAV" }).ok).toBe(true);
    expect(planVsoCreate({ affiliation: "DAV" }).ok).toBe(false);
    const plan = planVsoUpdate({ fullName: "Jane Doe" }, { partnershipStatus: "active_partner" });
    expect(plan).toEqual({
      ok: true,
      changes: { partnershipStatus: { before: "in_discussion", after: "active_partner" } },
    });
  });
});

describe("planEncounterCreate", () => {
  const now = new Date("2026-10-27T15:00:00Z");

  it("defaults occurredAt to now and keeps dates as ISO strings", () => {
    const plan = planEncounterCreate({ summary: " Called, left voicemail " }, now);
    expect(plan).toEqual({
      ok: true,
      changes: {
        occurredAt: { before: null, after: now.toISOString() },
        summary: { before: null, after: "Called, left voicemail" },
      },
    });
  });

  it("refuses an empty summary, a bad date and the future", () => {
    expect(planEncounterCreate({ summary: "" }, now).ok).toBe(false);
    expect(planEncounterCreate({ summary: "x", occurredAt: "not a date" }, now).ok).toBe(false);
    expect(planEncounterCreate({ summary: "x", occurredAt: "2026-11-30" }, now).ok).toBe(false);
  });
});

describe("driftedFields", () => {
  it("flags a field edited since the proposal", () => {
    const plan = planVeteranUpdate(stored, { city: "Cleveland" });
    if (!plan.ok) throw new Error(plan.error);
    expect(driftedFields(veteranSnapshot(stored), plan.changes)).toEqual([]);
    expect(driftedFields(veteranSnapshot({ ...stored, city: "Dalton" }), plan.changes)).toEqual(["city"]);
  });

  it("reads legacy boolean hasDependents forward", () => {
    expect(veteranSnapshot({ hasDependents: true }).hasDependents).toBe("yes");
  });
});

describe("labels and expiry", () => {
  it("labels a veteran by first name and initial", () => {
    expect(veteranLabel({ firstName: "Maria", lastInitial: "G" })).toBe("Maria G.");
  });

  it("expires after a week", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(isExpired(new Date("2026-10-21T00:00:00Z"), now)).toBe(false);
    expect(isExpired(new Date("2026-10-19T00:00:00Z"), now)).toBe(true);
  });
});

describe("resources", () => {
  const stored = {
    organizationName: "Hope House",
    buckets: ["housing"],
    geoScope: "state",
    geoStates: ["TN"],
    accessMethod: "phone",
    accessValue: "423-555-0100",
    verificationStatus: "live",
    externalId: "va:1",
  };

  it("plans an edit on the named fields and validates the whole record", () => {
    expect(planResourceUpdate(stored, { buckets: ["housing", "essentials"] })).toEqual({
      ok: true,
      changes: { buckets: { before: ["housing"], after: ["housing", "essentials"] } },
    });
    // Local scope needs localities.
    expect(planResourceUpdate(stored, { geoScope: "local" }).ok).toBe(false);
  });

  it("keeps machine-owned fields off limits", () => {
    const plan = planResourceUpdate(stored, { externalId: "x", lastVerified: "2026-01-01" });
    expect(!plan.ok && plan.error).toMatch(/Not editable on a resource: externalId, lastVerified/);
  });

  it("builds the full input an approval saves", () => {
    const built = buildResourceInput(stored, { contactPhone: "4235550199" });
    expect(built.ok && built.input.organizationName).toBe("Hope House");
    expect(built.ok && built.input.contactPhone).toBe("423-555-0199");
    expect(built.ok && "externalId" in built.input).toBe(false);
  });

  it("plans a create", () => {
    expect(planResourceCreate({ organizationName: "New Org", buckets: ["work"] }).ok).toBe(true);
    expect(planResourceCreate({ buckets: ["work"] }).ok).toBe(false);
  });
});

describe("transactions", () => {
  it("validates dates and amounts", () => {
    const ok = planTransactionCreate({ date: "2026-10-27", type: "expense", amount: 42.5, categoryId: "c1", vendor: "Kroger" });
    expect(ok.ok).toBe(true);
    expect(planTransactionCreate({ date: "2026-02-30", type: "expense", amount: 1, categoryId: "c1" }).ok).toBe(false);
    expect(planTransactionCreate({ date: "2026-10-27", type: "expense", amount: 0, categoryId: "c1" }).ok).toBe(false);
  });

  it("plans an edit", () => {
    const stored = { date: "2026-10-01", type: "income", amount: 100, categoryId: "c2", vendor: "" };
    expect(planTransactionUpdate(stored, { donorName: "Pat" })).toEqual({
      ok: true,
      changes: { donorName: { before: null, after: "Pat" } },
    });
  });
});
