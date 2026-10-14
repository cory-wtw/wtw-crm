import { listCategories, listTransactions } from "@/lib/db/finance";
import { SeedCategoriesButton } from "../seed-categories-button";
import { CategoriesEditor } from "./categories-editor";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [categories, transactions] = await Promise.all([
    listCategories(),
    listTransactions(),
  ]);
  const counts: Record<string, number> = {};
  for (const t of transactions) counts[t.categoryId] = (counts[t.categoryId] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Categories</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each expense category carries a default program / management /
          fundraising split. Transactions use it unless you override one by
          hand — so changing a default here re-splits every transaction that
          hasn&apos;t been overridden.
        </p>
      </div>
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <SeedCategoriesButton />
        </div>
      ) : (
        <CategoriesEditor categories={categories} counts={counts} />
      )}
    </div>
  );
}
