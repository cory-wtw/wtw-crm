import Link from "next/link";
import { planZipBackfill } from "@/lib/zip-backfill";
import { ApplyButton } from "./apply-button";

export const dynamic = "force-dynamic";

// The admin layout already turns away anyone who isn't an admin.
export default async function FillZipsPage() {
  const plan = await planZipBackfill();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Fill in ZIPs
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Matching uses a ZIP to find nearby resources. This fills one in for
          every veteran who has a city but no ZIP. A city with several ZIPs
          gets a central one &mdash; close enough for matching. ZIPs already on
          a record are never changed.
        </p>
      </div>

      <p className="text-sm">
        {plan.total} veterans · {plan.alreadyHad} already have a ZIP ·{" "}
        <span className="font-bold">{plan.inferred.length} to fill</span> ·{" "}
        {plan.unresolved.length} can&rsquo;t be placed
      </p>

      {plan.inferred.length > 0 && <ApplyButton count={plan.inferred.length} />}

      {plan.inferred.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Will fill</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {plan.inferred.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 p-3 text-sm">
                <span className="font-mono font-bold">{r.zip}</span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/veterans/${r.id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {r.name}
                  </Link>{" "}
                  <span className="text-muted-foreground">· {r.from}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.note}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.unresolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">
            Couldn&rsquo;t place &mdash; ask on the next call
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {plan.unresolved.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <Link
                  href={`/veterans/${r.id}/edit`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {r.name}
                </Link>{" "}
                <span className="text-muted-foreground">· {r.from}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
