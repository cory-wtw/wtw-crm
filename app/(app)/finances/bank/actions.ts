"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { earliestSyncFrom } from "@/lib/finance/bank-sync-core";
import {
  LikelyDuplicateError,
  addInboxItem,
  connectBank,
  disconnectBank,
  dismissInboxItem,
  runBankSync,
  saveBankAccounts,
  type SyncResult,
} from "@/lib/finance/bank-sync";
import { requireFinanceSession } from "@/lib/finance/require-session";
import { isoDateSchema } from "@/lib/schemas";

type Result<T = object> = ({ ok: true } & T) | ({ ok: false; error: string } & Partial<T>);

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function done() {
  revalidatePath("/finances", "layout");
}

const SYNC_ID = /^sf_[0-9a-f]{24}$/;

export async function connectBankAction(token: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = z.string().trim().min(10).max(2000).safeParse(token);
  if (!parsed.success) return { ok: false, error: "Paste the setup token from SimpleFIN Bridge." };
  try {
    await connectBank(parsed.data, auth.session);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

const accountsSchema = z.object({
  accountIds: z.array(z.string().min(1).max(200)).min(1, "Pick an account.").max(20),
  syncFrom: isoDateSchema.refine(
    (d) => d >= earliestSyncFrom() && d <= new Date().toISOString().slice(0, 10),
    "Pick a start date within the last year.",
  ),
});

export async function saveBankAccountsAction(raw: unknown): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = accountsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pick an account and a start date." };
  try {
    await saveBankAccounts(parsed.data.accountIds, parsed.data.syncFrom, auth.session);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

export async function syncBankAction(): Promise<Result<{ result: SyncResult }>> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    const outcome = await runBankSync(auth.session);
    done();
    if (outcome.status === "busy") return { ok: false, error: "A sync is already running. Give it a minute and refresh." };
    if (outcome.status === "not_ready") return { ok: false, error: "Pick WTW's account first." };
    return { ok: true, result: outcome.result };
  } catch (err) {
    done();
    return { ok: false, error: message(err) };
  }
}

export async function disconnectBankAction(): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    await disconnectBank(auth.session);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

const addSchema = z.object({
  syncId: z.string().regex(SYNC_ID),
  vendor: z.string().trim().min(1, "Give it a vendor name").max(200),
  categoryId: z.string().min(1, "Pick a category"),
  force: z.boolean().default(false),
});

export async function addInboxItemAction(raw: unknown): Promise<Result<{ duplicate: boolean }>> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the row." };
  try {
    await addInboxItem(parsed.data.syncId, parsed.data, auth.session);
  } catch (err) {
    if (err instanceof LikelyDuplicateError) return { ok: false, error: err.message, duplicate: true };
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true, duplicate: false };
}

export async function dismissInboxItemAction(syncId: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!SYNC_ID.test(syncId)) return { ok: false, error: "Unknown row." };
  try {
    await dismissInboxItem(syncId, auth.session);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}
