import { listCategories, listFormOptions } from "@/lib/db/finance";
import { todayIso } from "@/lib/finance/range";
import { TransactionForm } from "../transaction-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const [categories, options] = await Promise.all([
    listCategories(),
    listFormOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">Add transaction</h1>
        <p className="text-sm text-muted-foreground">
          For anything that isn&apos;t in a bank or Zeffy export — cash, checks,
          in-kind reimbursements.
        </p>
      </div>
      <TransactionForm
        categories={categories}
        today={todayIso()}
        {...options}
      />
    </div>
  );
}
