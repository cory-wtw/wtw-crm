import Link from "next/link";
import { redirect } from "next/navigation";
import {
  contactDueDate,
  hasFiled,
  needsContactCadence,
} from "@/lib/contact-cadence";
import { listVeterans } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { formatDate } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { canAccessCrm } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Whole days a date is in the past, floored at 0. */
function daysOverdue(due: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
}

export default async function CheckInsPage() {
  const session = await getSession();
  if (!canAccessCrm(session)) redirect("/");

  const now = new Date();

  // listVeterans() already reads the whole collection, so this is a filter
  // over rows that are in memory anyway — same shape as the follow-up queue.
  const veterans = await listVeterans();
  const active = veterans.filter((v) => needsContactCadence(v.pipelineStage));

  const rows = active.map((veteran) => ({
    veteran,
    due: contactDueDate(veteran),
  }));

  const due = rows
    .filter((row) => row.due <= now)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const upcoming = active.length - due.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Check-ins
        </h1>
        <p className="text-sm text-muted-foreground">
          Once a week until they file, once a month after. Nobody goes quiet
          waiting on a claim.
        </p>
      </div>

      {due.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">Nothing due.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {upcoming === 0
              ? "No active veterans are waiting on a check-in."
              : `${upcoming} veteran${upcoming === 1 ? "" : "s"} still inside their cadence.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            {due.length} due · oldest first
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {due.map(({ veteran, due: dueDate }) => {
              const overdue = daysOverdue(dueDate, now);
              const filed = hasFiled(veteran.pipelineStage);
              return (
                <li
                  key={veteran.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">
                      {formatShortName(veteran.firstName, veteran.lastInitial)}
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {filed ? "Monthly · filed" : "Weekly · not filed"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(dueDate)}
                      {overdue > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {overdue} day{overdue === 1 ? "" : "s"} overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/veterans/${veteran.id}`}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
                  >
                    Log check-in
                  </Link>
                </li>
              );
            })}
          </ul>
          {upcoming > 0 && (
            <p className="text-xs text-muted-foreground">
              {upcoming} more still inside their cadence.
            </p>
          )}
        </>
      )}
    </div>
  );
}
