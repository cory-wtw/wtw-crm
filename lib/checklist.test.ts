import { describe, expect, it } from "vitest";
import { applyChecklistEdit, checklistEditSchema, type StoredChecklistItem } from "./checklist";

const NOW = new Date("2026-10-31T12:00:00Z");
const item = (o: Partial<StoredChecklistItem>): StoredChecklistItem => ({
  id: "i1",
  label: "Bus pass",
  done: false,
  doneAt: null,
  addedBy: "u",
  addedAt: new Date("2026-10-01T12:00:00Z"),
  ...o,
});
const edit = (o: object) => checklistEditSchema.parse(o);
let n = 0;
const ids = () => `new${++n}`;

describe("applyChecklistEdit", () => {
  it("adds, ticks by label, and removes in one go", () => {
    const r = applyChecklistEdit(
      [item({}), item({ id: "i2", label: "State ID" })],
      edit({ add: ["Phone"], done: ["state id"], remove: ["i1"] }),
      "u",
      NOW,
      ids,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.items.map((i) => [i.label, i.done])).toEqual([
      ["State ID", true],
      ["Phone", false],
    ]);
    expect(r.items[0].doneAt).toEqual(NOW);
    expect(r.added).toEqual(["Phone"]);
    expect(r.done).toEqual(["State ID"]);
    expect(r.removed).toEqual(["Bus pass"]);
  });

  it("refuses an item that isn't there, or a duplicate open one", () => {
    expect(applyChecklistEdit([item({})], edit({ done: ["Phone"] }), "u", NOW).ok).toBe(false);
    expect(applyChecklistEdit([item({})], edit({ add: ["bus pass"] }), "u", NOW).ok).toBe(false);
  });

  it("lets a done item be added again as a new need", () => {
    const r = applyChecklistEdit([item({ done: true, doneAt: NOW })], edit({ add: ["Bus pass"] }), "u", NOW, ids);
    expect(r.ok && r.items.length).toBe(2);
  });

  it("says so when nothing would change", () => {
    const r = applyChecklistEdit([item({ done: true, doneAt: NOW })], edit({ done: ["Bus pass"] }), "u", NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects an empty edit", () => {
    expect(checklistEditSchema.safeParse({}).success).toBe(false);
  });
});
