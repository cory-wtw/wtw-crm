import { listRecords } from "@/lib/db/finance";
import { todayIso } from "@/lib/finance/range";
import { RecordsPanel } from "./records-panel";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const records = await listRecords();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Records</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The paper trail behind the numbers: ledger exports, bank statements,
          receipts, filed 990s, letters from the accountant. Only admins can
          see or download these.
        </p>
      </div>
      <RecordsPanel
        thisYear={Number(todayIso().slice(0, 4))}
        records={records.map((r) => ({
          id: r.id,
          label: r.label,
          fileName: r.fileName,
          year: r.year,
          notes: r.notes ?? "",
          sizeBytes: r.sizeBytes,
          createdAtIso: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
