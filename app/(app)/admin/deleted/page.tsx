import Link from "next/link";
import { listUsers } from "@/lib/db/users";
import { listDeletedVeterans } from "@/lib/db/veterans";
import { formatDate } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { RestoreVeteranButton } from "../../veterans/[id]/restore-veteran-button";

export const dynamic = "force-dynamic";

// The admin layout already turns away anyone who isn't an admin.
export default async function RecentlyDeletedPage() {
  const [veterans, users] = await Promise.all([
    listDeletedVeterans(),
    listUsers(),
  ]);
  const usersByUid = new Map(users.map((u) => [u.uid, u]));
  function nameForUid(uid: string | null): string {
    const u = uid ? usersByUid.get(uid) : undefined;
    if (!u) return "Unknown";
    return u.displayName ?? u.email;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">
          Recently deleted
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Deleted veterans are hidden from every list, Outreach, Claude, and
          the public impact numbers. Their record and timeline are kept.
          Restore puts them back.
        </p>
      </div>

      {veterans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing deleted.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {veterans.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0 text-sm">
                <Link
                  href={`/veterans/${v.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {formatShortName(v.firstName, v.lastInitial)}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Deleted {formatDate(v.deletedAt)} by {nameForUid(v.deletedBy)}
                </p>
              </div>
              <RestoreVeteranButton veteranId={v.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
