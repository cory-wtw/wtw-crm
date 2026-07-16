import Link from "next/link";
import { listVeterans, type VeteranListItem } from "@/lib/db/veterans";
import { VeteransTable } from "./veterans-table";

export const dynamic = "force-dynamic";

export default async function VeteransPage() {
  const veterans = await listVeterans();

  const rows: VeteranListItem[] = veterans.map((v) => ({
    id: v.id,
    name: v.name,
    preferredName: v.preferredName ?? null,
    pipelineStage: v.pipelineStage,
    assigneeUid: v.assigneeUid,
    dateFound: v.dateFound?.toISOString() ?? null,
    updatedAt: v.updatedAt.toISOString(),
    anticipatedMonthly: null, // Computed from rate code in detail view
    actualMonthly: null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Veterans</h1>
          <p className="text-sm text-muted-foreground">
            Everyone WTW has identified.
          </p>
        </div>
        <Link
          href="/veterans/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          Add veteran
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No veterans yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Once you add the first one, the AirTable import script can backfill
            the rest.
          </p>
          <Link
            href="/veterans/new"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add the first veteran
          </Link>
        </div>
      ) : (
        <VeteransTable rows={rows} />
      )}
    </div>
  );
}
