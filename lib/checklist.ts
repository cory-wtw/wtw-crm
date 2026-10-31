/**
 * Edits to a veteran's "Still needs" checklist. Pure, so the veteran page's
 * buttons, Claude's approved change requests and the tests all run the same
 * rules.
 */

import { z } from "zod";
import { checklistLabelSchema } from "@/lib/schemas";

export type StoredChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  doneAt: Date | null;
  addedBy: string;
  addedAt: Date;
};

/**
 * One edit, possibly several items at once — a phone call often adds a bus
 * pass and ticks off the ID in the same breath. Existing items are named by id
 * or by label (case doesn't matter), since a label is what Claude hears.
 */
export const checklistEditSchema = z
  .object({
    add: z.array(checklistLabelSchema).max(20).default([]),
    done: z.array(z.string().trim().min(1)).max(20).default([]),
    reopen: z.array(z.string().trim().min(1)).max(20).default([]),
    remove: z.array(z.string().trim().min(1)).max(20).default([]),
  })
  .refine((e) => e.add.length + e.done.length + e.reopen.length + e.remove.length > 0, {
    message: "Nothing to change.",
  });
export type ChecklistEdit = z.infer<typeof checklistEditSchema>;

export type ChecklistResult =
  | {
      ok: true;
      items: StoredChecklistItem[];
      /** What actually changed, by label — for the audit log and the review. */
      added: string[];
      done: string[];
      reopened: string[];
      removed: string[];
    }
  | { ok: false; error: string };

const key = (s: string) => s.trim().toLowerCase();

/** The item a reference means: an id first, then an open item by label, then
 *  any item by label. */
function find(items: StoredChecklistItem[], ref: string): StoredChecklistItem | undefined {
  return (
    items.find((i) => i.id === ref) ??
    items.find((i) => !i.done && key(i.label) === key(ref)) ??
    items.find((i) => key(i.label) === key(ref))
  );
}

/**
 * Apply an edit. Fails, changing nothing, when it names an item that isn't
 * there or adds one that's already open. Ticking something already ticked is
 * not an error — it's what the record already says.
 */
export function applyChecklistEdit(
  current: readonly StoredChecklistItem[],
  edit: ChecklistEdit,
  uid: string,
  now: Date,
  newId: () => string = () => crypto.randomUUID(),
): ChecklistResult {
  let items = current.map((i) => ({ ...i }));
  const added: string[] = [];
  const done: string[] = [];
  const reopened: string[] = [];
  const removed: string[] = [];

  for (const ref of edit.remove) {
    const item = find(items, ref);
    if (!item) return { ok: false, error: `"${ref}" isn't on the checklist.` };
    items = items.filter((i) => i !== item);
    removed.push(item.label);
  }
  for (const ref of edit.done) {
    const item = find(items, ref);
    if (!item) return { ok: false, error: `"${ref}" isn't on the checklist.` };
    if (!item.done) {
      item.done = true;
      item.doneAt = now;
      done.push(item.label);
    }
  }
  for (const ref of edit.reopen) {
    const item = find(items, ref);
    if (!item) return { ok: false, error: `"${ref}" isn't on the checklist.` };
    if (item.done) {
      item.done = false;
      item.doneAt = null;
      reopened.push(item.label);
    }
  }
  for (const label of edit.add) {
    if (items.some((i) => !i.done && key(i.label) === key(label))) {
      return { ok: false, error: `"${label}" is already on the list.` };
    }
    items.push({ id: newId(), label, done: false, doneAt: null, addedBy: uid, addedAt: now });
    added.push(label);
  }

  if (added.length + done.length + reopened.length + removed.length === 0) {
    return { ok: false, error: "That's already what the checklist says." };
  }
  return { ok: true, items, added, done, reopened, removed };
}

/** "+ Bus pass; ✓ State ID" — one line for the audit log. */
export function describeChecklistChange(r: Extract<ChecklistResult, { ok: true }>): string {
  return [
    ...r.added.map((l) => `+ ${l}`),
    ...r.done.map((l) => `✓ ${l}`),
    ...r.reopened.map((l) => `reopened ${l}`),
    ...r.removed.map((l) => `− ${l}`),
  ].join("; ");
}
