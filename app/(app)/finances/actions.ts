"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { computeDiff } from "@/lib/audit-diff";
import { CATEGORIES, TRANSACTIONS, listCategories } from "@/lib/db/finance";
import { importIdentity } from "@/lib/finance/bank-import";
import { adminDb } from "@/lib/firebase/admin";
import { getSession, type Session } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";
import {
  DEFAULT_CATEGORIES,
  categoryInputSchema,
  isoDateSchema,
  transactionInputSchema,
  type Category,
} from "@/lib/schemas";

type Result<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Like the other actions' dropUndefined, but also drops "" (blank form fields). */
function dropEmpty<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map(
      (i) =>
        `${i.path.map((p) => String(p)).join(".") || "form"}: ${i.message}`,
    )
    .join("; ");
}

async function requireFinanceSession(): Promise<
  { session: Session } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (!canManageFinances(session))
    return { error: "Only admins can manage finances." };
  return { session };
}

function revalidateFinances() {
  revalidatePath("/finances", "layout");
}

async function loadCategory(id: string): Promise<Category | null> {
  const snap = await adminDb.collection(CATEGORIES).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    type: d.type,
    defaultProgramPct: d.defaultProgramPct,
    defaultMgmtPct: d.defaultMgmtPct,
    defaultFundraisingPct: d.defaultFundraisingPct,
  };
}

// ---------------------------------------------------------------------------
// Transactions

export async function saveTransactionAction(
  id: string | null,
  rawInput: unknown,
): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { session } = auth;

  const parsed = transactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;
  const category = await loadCategory(input.categoryId);
  if (!category) return { ok: false, error: "That category no longer exists." };
  if (category.type !== input.type) {
    return {
      ok: false,
      error: `"${category.name}" is an ${category.type} category.`,
    };
  }

  const now = new Date();
  // Income is never functionally allocated, and an allocation identical to
  // the category default is stored as "inherit" so later edits to the
  // default flow through.
  const allocation =
    input.type === "expense" &&
    input.allocation &&
    !(
      input.allocation.programPct === category.defaultProgramPct &&
      input.allocation.mgmtPct === category.defaultMgmtPct &&
      input.allocation.fundraisingPct === category.defaultFundraisingPct
    )
      ? input.allocation
      : undefined;
  const fields = {
    ...input,
    amount: Math.round(input.amount * 100) / 100,
    allocation,
    donorName: input.type === "income" ? input.donorName : undefined,
    campaign: input.type === "income" ? input.campaign : undefined,
  };

  if (!id) {
    const ref = await adminDb.collection(TRANSACTIONS).add({
      ...dropEmpty(fields),
      source: "manual",
      createdBy: session.uid,
      createdAt: now,
      updatedBy: session.uid,
      updatedAt: now,
    });
    await logAudit({
      action: "create",
      resourceType: "transaction",
      resourceId: ref.id,
    });
    revalidateFinances();
    return { ok: true, id: ref.id };
  }

  const ref = adminDb.collection(TRANSACTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Transaction not found." };
  const existing = snap.data()!;

  // Rewrite the whole document (minus provenance) so a cleared field
  // actually clears instead of lingering from the previous version.
  await ref.set({
    ...dropEmpty(fields),
    source: existing.source ?? "manual",
    createdBy: existing.createdBy ?? session.uid,
    createdAt: existing.createdAt ?? now,
    updatedBy: session.uid,
    updatedAt: now,
  });
  await logAudit({
    action: "update",
    resourceType: "transaction",
    resourceId: id,
    diff: computeDiff(
      existing as Record<string, unknown>,
      fields as unknown as Record<string, unknown>,
      Object.keys(fields),
    ),
  });
  revalidateFinances();
  return { ok: true, id };
}

export async function deleteTransactionAction(id: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };

  const ref = adminDb.collection(TRANSACTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Transaction not found." };
  const before = snap.data()!;
  await ref.delete();
  await logAudit({
    action: "delete",
    resourceType: "transaction",
    resourceId: id,
    diff: {
      date: { before: before.date, after: null },
      vendor: { before: before.vendor, after: null },
      amount: { before: before.amount, after: null },
    },
  });
  revalidateFinances();
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// CSV import (bank statements and Zeffy exports)

const importRowSchema = z.object({
  date: isoDateSchema,
  description: z.string().max(500),
  vendor: z.string().trim().max(200),
  /** As it appeared in the file: positive, except Zeffy refunds. */
  amount: z.number().finite(),
  /** Which way the money moved in the file. */
  type: z.enum(["income", "expense"]),
  categoryId: z.string().min(1),
  donorName: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  /**
   * Nth row in the whole file with this importIdentity. Numbered by the
   * client across the full file, because the upload is sent in chunks and
   * twins can land in different ones.
   */
  occurrence: z.number().int().nonnegative(),
});
export type ImportRowInput = z.infer<typeof importRowSchema>;

const IMPORT_CHUNK = 250;

const importSchema = z.object({
  mode: z.enum(["bank", "zeffy"]),
  // Kept small so a chunk stays well under the 1 MB server-action body
  // limit even with 500-character descriptions. The client splits files.
  rows: z.array(importRowSchema).min(1).max(IMPORT_CHUNK),
});

export type ImportResult = { created: number; duplicates: number };

export async function importTransactionsAction(
  raw: unknown,
): Promise<Result<ImportResult>> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { session } = auth;

  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const { mode, rows } = parsed.data;
  const categories = new Map((await listCategories()).map((c) => [c.id, c]));

  // Deterministic doc IDs make re-importing an overlapping statement a
  // no-op for the rows already on file. Two genuinely identical rows in one
  // file (same day, amount and payee) differ by their occurrence number.
  const docs: { id: string; data: Record<string, unknown> }[] = [];
  const now = new Date();
  for (const row of rows) {
    const category = categories.get(row.categoryId);
    if (!category) {
      return { ok: false, error: `Unknown category on the ${row.date} row.` };
    }
    const identity = importIdentity(mode, row);
    const id = `${mode}_${createHash("sha1").update(`${identity}#${row.occurrence}`).digest("hex").slice(0, 24)}`;

    // Money in, filed under an expense category, is a refund: it reduces
    // that expense. Same in reverse for income.
    const signed = category.type === row.type ? row.amount : -row.amount;
    docs.push({
      id,
      data: dropEmpty({
        date: row.date,
        vendor: row.vendor,
        description: row.description,
        amount: Math.round(signed * 100) / 100,
        type: category.type,
        categoryId: category.id,
        donorName: category.type === "income" ? row.donorName : undefined,
        campaign: category.type === "income" ? row.campaign : undefined,
        source: mode === "zeffy" ? "zeffy" : "bank_csv",
        createdBy: session.uid,
        createdAt: now,
        updatedBy: session.uid,
        updatedAt: now,
      }),
    });
  }

  const refs = docs.map((d) => adminDb.collection(TRANSACTIONS).doc(d.id));
  const existing = await adminDb.getAll(...refs);
  const batch = adminDb.batch();
  const createdIds: string[] = [];
  existing.forEach((snap, j) => {
    if (snap.exists) return;
    batch.set(refs[j], docs[j].data);
    createdIds.push(docs[j].id);
  });
  if (createdIds.length > 0) {
    await batch.commit();
    // One entry per chunk rather than per row: a year's statement would
    // otherwise be hundreds of audit writes.
    await logAudit({
      action: "create",
      resourceType: "transaction",
      resourceId: `${mode}-import`,
      diff: { transactionIds: { before: null, after: createdIds } },
    });
  }
  const created = createdIds.length;
  const duplicates = docs.length - created;

  revalidateFinances();
  return { ok: true, created, duplicates };
}

// ---------------------------------------------------------------------------
// Categories

export async function saveCategoryAction(
  id: string | null,
  rawInput: unknown,
): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = categoryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const input = parsed.data;
  const all = await listCategories();
  const clash = all.find(
    (c) =>
      c.id !== id && c.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (clash) return { ok: false, error: `"${input.name}" already exists.` };

  if (!id) {
    const ref = await adminDb.collection(CATEGORIES).add(input);
    await logAudit({
      action: "create",
      resourceType: "transactionCategory",
      resourceId: ref.id,
    });
    revalidateFinances();
    return { ok: true, id: ref.id };
  }

  const existing = all.find((c) => c.id === id);
  if (!existing) return { ok: false, error: "Category not found." };
  if (existing.type !== input.type) {
    const used = await adminDb
      .collection(TRANSACTIONS)
      .where("categoryId", "==", id)
      .limit(1)
      .get();
    if (!used.empty) {
      return {
        ok: false,
        error: "This category has transactions, so it can't switch between income and expense.",
      };
    }
  }
  await adminDb.collection(CATEGORIES).doc(id).set(input);
  await logAudit({
    action: "update",
    resourceType: "transactionCategory",
    resourceId: id,
    diff: computeDiff(
      existing as unknown as Record<string, unknown>,
      input as unknown as Record<string, unknown>,
      Object.keys(input),
    ),
  });
  revalidateFinances();
  return { ok: true, id };
}

export async function deleteCategoryAction(id: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };

  const used = await adminDb
    .collection(TRANSACTIONS)
    .where("categoryId", "==", id)
    .limit(1)
    .get();
  if (!used.empty) {
    return {
      ok: false,
      error: "Transactions use this category. Move them to another category first.",
    };
  }
  await adminDb.collection(CATEGORIES).doc(id).delete();
  await logAudit({
    action: "delete",
    resourceType: "transactionCategory",
    resourceId: id,
  });
  revalidateFinances();
  return { ok: true, id };
}

/** One-time setup: load the starter category list. Skips names already present. */
export async function seedCategoriesAction(): Promise<Result<{ created: number }>> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };

  const existing = new Set(
    (await listCategories()).map((c) => c.name.toLowerCase()),
  );
  const batch = adminDb.batch();
  let created = 0;
  for (const c of DEFAULT_CATEGORIES) {
    if (existing.has(c.name.toLowerCase())) continue;
    batch.set(adminDb.collection(CATEGORIES).doc(), c);
    created++;
  }
  await batch.commit();
  revalidateFinances();
  return { ok: true, created };
}
