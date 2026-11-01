"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addInboxItem,
  connectBank,
  disconnectBank,
  dismissInboxItem,
  runBankSync,
  saveBankAccounts,
  type SyncResult,
} from "@/lib/finance/bank-sync";
import { getSession, type Session } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";
import { isoDateSchema } from "@/lib/schemas";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireFinanceSession(): Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (!canManageFinances(session)) return { error: "Only admins can manage finances." };
  return { session };
}

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function done() {
  revalidatePath("/finances", "layout");
}

export async function connectBankAction(token: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = z.string().trim().min(10).max(2000).safeParse(token);
  if (!parsed.success) return { ok: false, error: "Paste the setup token from SimpleFIN Bridge." };
  try {
    await connectBank(parsed.data, auth.session.uid);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

const accountsSchema = z.object({
  accountIds: z.array(z.string().min(1).max(200)).max(20),
  syncFrom: isoDateSchema,
});

export async function saveBankAccountsAction(raw: unknown): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = accountsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick an account and a start date." };
  try {
    await saveBankAccounts(parsed.data.accountIds, parsed.data.syncFrom);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

export async function syncBankAction(): Promise<Result<{ result: SyncResult | null }>> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    const result = await runBankSync(auth.session.uid);
    done();
    return { ok: true, result };
  } catch (err) {
    done();
    return { ok: false, error: message(err) };
  }
}

export async function disconnectBankAction(): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  await disconnectBank();
  done();
  return { ok: true };
}

const addSchema = z.object({
  syncId: z.string().regex(/^sf_[0-9a-f]{24}$/),
  vendor: z.string().trim().min(1, "Give it a vendor name").max(200),
  categoryId: z.string().min(1, "Pick a category"),
});

export async function addInboxItemAction(raw: unknown): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the row." };
  try {
    await addInboxItem(parsed.data.syncId, parsed.data, auth.session.uid);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}

export async function dismissInboxItemAction(syncId: string): Promise<Result> {
  const auth = await requireFinanceSession();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!/^sf_[0-9a-f]{24}$/.test(syncId)) return { ok: false, error: "Unknown row." };
  try {
    await dismissInboxItem(syncId, auth.session.uid);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  done();
  return { ok: true };
}
