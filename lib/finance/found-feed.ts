import "server-only";
import { listTransactions } from "@/lib/db/finance";
import { buildVendorIndex, matchVendor, suggestVendorName, type KnownVendor } from "./bank-import";
import { findLikelyDuplicate } from "./dedupe";
import { loadDedupeIndex } from "./dedupe-db";
import { fetchSimplefin, pickAccounts } from "./simplefin";
import { getSimplefinAccessUrl } from "./simplefin-store";

export type FoundTransaction = {
  simplefinId: string;
  date: string;
  type: "income" | "expense";
  /** Positive, as the books store it. */
  amount: number;
  description: string;
  /** Already in the books (same money from an import or by hand). */
  onFile: { id: string; vendor: string; reason: string } | null;
  /** From the last time this vendor was categorised, if ever. */
  suggestedVendor: string;
  suggestedCategoryId: string | null;
};

/**
 * Found's posted transactions from SimpleFIN, each checked against the books
 * and matched to a vendor seen before — the same checks the CSV import runs.
 * Read only: nothing is written here.
 */
export async function listFoundTransactions(days: number): Promise<FoundTransaction[]> {
  const accessUrl = await getSimplefinAccessUrl();
  if (!accessUrl) throw new Error("Found isn't connected yet. Connect it on Finances → Import.");
  const since = new Date(Date.now() - days * 86_400_000);
  const accounts = pickAccounts(await fetchSimplefin(accessUrl, since));
  if (accounts.length === 0) throw new Error("No Found account in the SimpleFIN feed.");

  const rows = accounts
    .flatMap((a) => a.transactions ?? [])
    .filter((t) => !t.pending && t.posted > 0)
    .map((t) => {
      const signed = Number(t.amount);
      return {
        simplefinId: t.id,
        date: new Date(t.posted * 1000).toISOString().slice(0, 10),
        type: (signed < 0 ? "expense" : "income") as FoundTransaction["type"],
        amount: Math.abs(signed),
        description: (t.payee || t.description || t.memo || "").trim(),
      };
    })
    .filter((r) => Number.isFinite(r.amount) && r.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length === 0) return [];

  // Newest first, so the latest categorisation of a vendor wins.
  const known: KnownVendor[] = (await listTransactions())
    .filter((t) => t.vendor && t.amount > 0)
    .map((t) => ({ vendor: t.vendor, description: t.description, categoryId: t.categoryId, type: t.type }));
  const vendors = buildVendorIndex(known);
  const dedupe = await loadDedupeIndex(rows.map((r) => r.date));

  return rows.map((r) => {
    const match = matchVendor(r.description, r.type, vendors);
    const vendor = match?.vendor ?? suggestVendorName(r.description);
    const dup = findLikelyDuplicate(
      { date: r.date, amount: r.amount, type: r.type, vendor, description: r.description },
      dedupe,
    );
    return {
      ...r,
      onFile: dup ? { id: dup.existing.id, vendor: dup.existing.vendor, reason: dup.reason } : null,
      suggestedVendor: vendor,
      suggestedCategoryId: match?.categoryId ?? null,
    };
  });
}
