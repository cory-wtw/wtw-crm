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

type QueueRow = {
  id: string;
  name: string;
  badge?: string;
  due: Date;
  actionHref: string;
  actionLabel: string;
};

/**
 * One "X due, oldest first" queue. Check-ins and follow-ups are two
 * different questions — is this veteran still hearing from us, and did this
 * referral land — but staff works both the same way: a due list, oldest
 * first, one action per row. Sharing the shell keeps that consistent instead
 * of two pages quietly drifting apart.
 */
function QueueSection({
  title,
  description,
  now,
  rows,
  upcoming,
  emptyMessage,
}: {
  title: string;
  description: string;
  now: Date;
  rows: QueueRow[];
  upcoming: number;
  emptyMessage: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-bold">Nothing due.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {upcoming === 0
              ? emptyMessage
              : `${upcoming} more still inside the window.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            {rows.length} due · oldest first
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((row) => {
              const overdue = daysOverdue(row.due, now);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">
                      {row.name}
                      {row.badge && (
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {row.badge}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(row.due)}
                      {overdue > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {overdue} day{overdue === 1 ? "" : "s"} overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={row.actionHref}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
                  >
                    {row.actionLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
          {upcoming > 0 && (
            <p className="text-xs text-muted-foreground">
              {upcoming} more still inside the window.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default async function OutreachPage() {
  const session = await getSession();
  if (!canAccessCrm(session)) redirect("/");

  const now = new Date();

  // One read of the collection feeds both queues below — they were separate
  // pages before, each re-reading the same veterans.
  const veterans = await listVeterans();

  const cadenceActive = veterans.filter((v) =>
    needsContactCadence(v.pipelineStage),
  );
  const checkInRows: QueueRow[] = cadenceActive
    .map((veteran) => ({ veteran, due: contactDueDate(veteran) }))
    .filter((row) => row.due <= now)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map(({ veteran, due }) => ({
      id: veteran.id,
      name: formatShortName(veteran.firstName, veteran.lastInitial),
      badge: hasFiled(veteran.pipelineStage) ? "Monthly · filed" : "Weekly · not filed",
      due,
      actionHref: `/veterans/${veteran.id}`,
      actionLabel: "Log check-in",
    }));
  const checkInsUpcoming = cadenceActive.length - checkInRows.length;

  const followUpRows: QueueRow[] = veterans
    .filter(
      (v) =>
        v.conciergeStatus === "referred" &&
        v.followUpDue !== null &&
        v.followUpDue <= now,
    )
    .sort((a, b) => a.followUpDue!.getTime() - b.followUpDue!.getTime())
    .map((veteran) => ({
      id: veteran.id,
      name: formatShortName(veteran.firstName, veteran.lastInitial),
      due: veteran.followUpDue!,
      actionHref: `/follow-ups/${veteran.id}`,
      actionLabel: "Record outcomes",
    }));
  const followUpsUpcoming = veterans.filter(
    (v) =>
      v.conciergeStatus === "referred" &&
      v.followUpDue !== null &&
      v.followUpDue > now,
  ).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Outreach
        </h1>
        <p className="text-sm text-muted-foreground">
          Two queues: the standing check-in cadence, and the two-week read on
          referrals.
        </p>
      </div>

      <QueueSection
        title="Check-ins"
        description="Once a week until they file, once a month after. Nobody goes quiet waiting on a claim."
        now={now}
        rows={checkInRows}
        upcoming={checkInsUpcoming}
        emptyMessage="No active veterans are waiting on a check-in."
      />

      <QueueSection
        title="Referral follow-ups"
        description="Two weeks after a packet goes out, we ask how it went. What they say is the only way we find out a number is dead."
        now={now}
        rows={followUpRows}
        upcoming={followUpsUpcoming}
        emptyMessage="No referrals are waiting on a follow-up."
      />
    </div>
  );
}
