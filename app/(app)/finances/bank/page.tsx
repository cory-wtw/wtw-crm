import { listCategories } from "@/lib/db/finance";
import { getBankConnection, listInbox } from "@/lib/finance/bank-sync";
import { BankPanel } from "./bank-panel";

export const dynamic = "force-dynamic";

export default async function BankPage() {
  const [connection, inbox, categories] = await Promise.all([
    getBankConnection(),
    listInbox(),
    listCategories(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Bank</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          WTW&apos;s bank account, synced through SimpleFIN. New transactions
          come in on their own. Vendors you&apos;ve categorised before go
          straight into the books; anything new or anything that looks like a
          row already on file waits below for you.
        </p>
      </div>
      <BankPanel connection={connection} inbox={inbox} categories={categories} />
    </div>
  );
}
