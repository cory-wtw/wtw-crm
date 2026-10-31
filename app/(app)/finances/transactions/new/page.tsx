import { listCategories, listFormOptions } from "@/lib/db/finance";
import { listVeterans } from "@/lib/db/veterans";
import { todayIso } from "@/lib/finance/range";
import { veteranOptions } from "@/lib/finance/per-veteran";
import { TransactionForm } from "../transaction-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ veteranId?: string }>;
}) {
  const [{ veteranId }, categories, options, veterans] = await Promise.all([
    searchParams,
    listCategories(),
    listFormOptions(),
    listVeterans(),
  ]);
  const forVeteran = veteranId && veterans.some((v) => v.id === veteranId) ? veteranId : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Add transaction</h1>
        <p className="text-sm text-muted-foreground">
          For anything that isn&apos;t in a bank or Zeffy export — cash, checks,
          in-kind reimbursements.
        </p>
      </div>
      <TransactionForm
        categories={categories}
        veterans={veteranOptions(veterans)}
        today={todayIso()}
        {...options}
        defaults={forVeteran ? { veteranId: forVeteran } : undefined}
        returnTo={forVeteran ? `/veterans/${forVeteran}` : undefined}
      />
    </div>
  );
}
