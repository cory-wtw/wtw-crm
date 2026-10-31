import { notFound } from "next/navigation";
import { getTransaction, listCategories, listFormOptions } from "@/lib/db/finance";
import { listVeterans } from "@/lib/db/veterans";
import { veteranOptions } from "@/lib/finance/per-veteran";
import { todayIso } from "@/lib/finance/range";
import { TRANSACTION_SOURCE_LABELS } from "@/lib/schemas";
import { formatDate } from "@/lib/format";
import { TransactionForm } from "../transaction-form";

export const dynamic = "force-dynamic";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [categories, options, tx, veterans] = await Promise.all([
    listCategories(),
    listFormOptions(),
    getTransaction(id),
    listVeterans(),
  ]);
  if (!tx) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Edit transaction</h1>
        <p className="text-sm text-muted-foreground">
          From {TRANSACTION_SOURCE_LABELS[tx.source]} · added {formatDate(tx.createdAt)}
        </p>
      </div>
      <TransactionForm
        categories={categories}
        veterans={veteranOptions(veterans)}
        today={todayIso()}
        {...options}
        initial={{
          id: tx.id,
          values: {
            type: tx.type,
            date: tx.date,
            amount: String(tx.amount),
            categoryId: tx.categoryId,
            vendor: tx.vendor,
            description: tx.description ?? "",
            donorName: tx.donorName ?? "",
            campaign: tx.campaign ?? "",
            notes: tx.notes ?? "",
            veteranId: tx.veteranId ?? "",
            customSplit: !!tx.allocation,
            programPct: tx.allocation ? String(tx.allocation.programPct) : "",
            mgmtPct: tx.allocation ? String(tx.allocation.mgmtPct) : "",
            fundraisingPct: tx.allocation ? String(tx.allocation.fundraisingPct) : "",
          },
        }}
      />
    </div>
  );
}
