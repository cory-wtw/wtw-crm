import Link from "next/link";
import { countVeteransByStage } from "@/lib/db/veterans";
import { PIPELINE_LABELS, type PipelineStage } from "@/lib/schemas";

const STAGE_ORDER: PipelineStage[] = [
  "found",
  "connected",
  "filed",
  "won",
  "lost",
];

export default async function Dashboard() {
  const counts = await countVeteransByStage();
  const total = STAGE_ORDER.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Dashboard</h1>
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

      <section className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        VSOs, encounters, and the AirTable import are coming next.
      </section>
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
    <Link
      href={`/veterans?stage=${stage}`}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {PIPELINE_LABELS[stage]}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{count}</p>
    </Link>
  );
}
