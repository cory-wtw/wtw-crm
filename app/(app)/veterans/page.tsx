import Link from "next/link";
import {
  countVeteransByStage,
  listVeterans,
  type VeteranListItem,
} from "@/lib/db/veterans";
import { PIPELINE_LABELS, type PipelineStage } from "@/lib/schemas";
import { VeteransTable } from "./veterans-table";

export const dynamic = "force-dynamic";

const STAGE_ORDER: PipelineStage[] = [
  "found",
  "connected",
  "filed",
  "won",
  "lost",
];

export default async function VeteransPage() {
  const [veterans, counts] = await Promise.all([
    listVeterans(),
    countVeteransByStage(),
  ]);
  const total = STAGE_ORDER.reduce((sum, s) => sum + counts[s], 0);

  const rows: VeteranListItem[] = veterans.map((v) => ({
    id: v.id,
    firstName: v.firstName,
    lastInitial: v.lastInitial ?? "",
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

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Pipeline
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {STAGE_ORDER.map((stage) => (
            <StageCard key={stage} stage={stage} count={counts[stage]} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {total === 0
            ? "No veterans yet. Add the first one to start the pipeline."
            : `${total} ${total === 1 ? "veteran" : "veterans"} total.`}
        </p>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No veterans yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add veterans as outreach identifies them.
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

function StageCard({
  stage,
  count,
}: {
  stage: PipelineStage;
  count: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {PIPELINE_LABELS[stage]}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{count}</p>
    </div>
  );
}
