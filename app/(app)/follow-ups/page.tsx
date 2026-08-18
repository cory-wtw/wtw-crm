import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function FollowUpsPage() {
  const session = await getSession();
  if (!canAccessCrm(session)) redirect("/");

  const now = new Date();

  // listVeterans() already reads the whole collection, so this is a filter over
  // rows that are in memory anyway. No query, no index, no scheduler — the
  // queue is computed at page load, and a person works it.
  const veterans = await listVeterans();
  const due = veterans
    .filter(
      (v) =>
        v.conciergeStatus === "referred" &&
        v.followUpDue !== null &&
        v.followUpDue <= now,
    )
    .sort((a, b) => a.followUpDue!.getTime() - b.followUpDue!.getTime());

  const upcoming = veterans.filter(
    (v) =>
      v.conciergeStatus === "referred" &&
      v.followUpDue !== null &&
      v.followUpDue > now,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Follow-ups
        </h1>
        <p className="text-sm text-muted-foreground">
          Two weeks after a packet goes out, we ask how it went. What they say
          is the only way we find out a number is dead.
        </p>
      </div>

      {due.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">Nothing due.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {upcoming === 0
              ? "No referrals are waiting on a follow-up."
              : `${upcoming} referral${upcoming === 1 ? "" : "s"} still inside the two weeks.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            {due.length} due · oldest first
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {due.map((veteran) => {
              const overdue = daysOverdue(veteran.followUpDue!, now);
              return (
                <li
                  key={veteran.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-bold">
                      {formatShortName(veteran.firstName, veteran.lastInitial)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(veteran.followUpDue)}
                      {overdue > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {overdue} day{overdue === 1 ? "" : "s"} overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/follow-ups/${veteran.id}`}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
                  >
                    Record outcomes
                  </Link>
                </li>
              );
            })}
          </ul>
          {upcoming > 0 && (
            <p className="text-xs text-muted-foreground">
              {upcoming} more still inside the two weeks.
            </p>
          )}
        </>
      )}
    </div>
  );
}
