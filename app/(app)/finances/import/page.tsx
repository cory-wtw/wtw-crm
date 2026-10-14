import { listCategories, listTransactions } from "@/lib/db/finance";
import type { KnownVendor } from "@/lib/finance/bank-import";
import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const [categories, transactions] = await Promise.all([
    listCategories(),
    listTransactions(),
  ]);
  // Newest first (listTransactions' order), so the latest categorisation of
  // a vendor wins when matching.
  const known: KnownVendor[] = transactions
    .filter((t) => t.vendor && t.amount > 0)
    .map((t) => ({
      vendor: t.vendor,
      description: t.description,
      categoryId: t.categoryId,
      type: t.type,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Import CSV</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Paste or upload a bank statement or a Zeffy payments export. Rows
          from vendors you&apos;ve categorised before are filled in
          automatically; new ones are flagged for you to label. Re-importing
          an overlapping statement won&apos;t create duplicates.
        </p>
      </div>
      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm">
          Set up categories first.
        </p>
      ) : (
        <ImportPanel categories={categories} known={known} />
      )}
    </div>
  );
}
