import Link from "next/link";
import { redirect } from "next/navigation";
import { listEncounters } from "@/lib/db/encounters";
import { listVeterans } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import { summarizeDemand, type IntakeRun } from "@/lib/demand";
import { BUCKET_LABELS } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function RosterGapsPage() {
  const session = await getSession();
  if (!canAccessCrm(session)) redirect("/resources");

  // Read every veteran, then their encounters, rather than a collection-group
  // query. A collection group would need an index enabled in the console, and
  // an import tool that dies on a link to the Firebase console is a tool that
  // doesn't get used. Full reads into memory are this codebase's pattern and
  // are comfortable at this size; revisit somewhere north of a few hundred
  // veterans, when the index is worth setting up once.
  const veterans = await listVeterans();
  const perVeteran = await Promise.all(
    veterans.map((veteran) => listEncounters(veteran.id)),
  );

  const runs: IntakeRun[] = perVeteran
    .flat()
    .filter((encounter) => encounter.type === "intake")
    .map((encounter) => ({
      bucketsIdentified: encounter.bucketsIdentified,
      bucketsMatched: encounter.bucketsMatched,
      candidatesFound: encounter.candidatesFound,
    }));

  const summary = summarizeDemand(runs);
  const worst = summary.demand.filter((row) => row.unmet > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Roster gaps
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          What veterans asked for on intake calls, and what the directory
          couldn&rsquo;t answer. Every number here came off a real call, so this
          is the list in their words rather than our guesses.
        </p>
      </div>

      {summary.intakes === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <p className="text-sm font-bold">No intakes recorded yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run an intake from a veteran&rsquo;s record and it lands here — the
            calls where nothing matched included, which are the ones this page
            is for.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Intakes run" value={summary.intakes} />
            <Stat
              label="Ended with nobody"
              value={summary.emptyHanded}
              tint={summary.emptyHanded > 0}
            />
            <Stat label="Needs with a gap" value={worst.length} tint={worst.length > 0} />
          </div>

          <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
              What to go find, worst first
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Sorted by how often a need came up with nothing to offer for it.
              The top row is where an afternoon of roster-building pays off
              most.
            </p>

            <ul className="divide-y divide-border">
              {summary.demand.map((row) => (
                <li
                  key={row.bucket}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {BUCKET_LABELS[row.bucket]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Asked for on {row.asked}{" "}
                      {row.asked === 1 ? "call" : "calls"}
                      {row.unknown > 0 &&
                        ` · ${row.unknown} from before we recorded matches`}
                    </p>
                  </div>
                  {row.unmet > 0 ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-3 py-1 text-xs font-bold text-[color:var(--wtw-deep-gold)]">
                      Nothing to offer · {row.unmet}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Served every time
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {worst.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Add organizations for these at{" "}
              <Link
                href="/resources/new"
                className="font-bold text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
              >
                new resource
              </Link>
              , and check{" "}
              <Link
                href="/resources/classify"
                className="font-bold text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
              >
                unclassified records
              </Link>{" "}
              first — a resource already in the directory with no buckets set
              matches nobody, and reads exactly like a gap from here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-black ${
          tint ? "text-[color:var(--wtw-deep-gold)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
