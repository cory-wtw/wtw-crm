import Link from "next/link";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { TransactionsTable, type TransactionRow } from "./transactions-table";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, categories] = await Promise.all([
    listTransactions(),
    listCategories(),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));

  const rows: TransactionRow[] = transactions.map((t) => ({
    id: t.id,
    date: t.date,
    vendor: t.vendor,
    description: t.description ?? "",
    donorName: t.donorName ?? "",
    campaign: t.campaign ?? "",
    amount: t.amount,
    type: t.type,
    categoryId: t.categoryId,
    categoryName: names.get(t.categoryId) ?? "Uncategorized",
    customSplit: !!t.allocation,
    source: t.source,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Every dollar in and out. Click a row to edit or delete it.
          </p>
        </div>
        <Link
          href="/finances/transactions/new"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          Add transaction
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No transactions yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href="/finances/import" className="underline underline-offset-4">
              Import a bank or Zeffy CSV
            </Link>{" "}
            or add one by hand.
          </p>
        </div>
      ) : (
        <TransactionsTable
          rows={rows}
          categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        />
      )}
    </div>
  );
}
