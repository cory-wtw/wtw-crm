import Link from "next/link";
import { listOrgs } from "@/lib/db/orgs";
import { OrgsTable } from "./orgs-table";

export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  const orgs = await listOrgs();

  const rows = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    category: o.category,
    relationshipStatus: o.relationshipStatus,
    primaryContactName: o.primaryContactName ?? null,
    city: o.city ?? null,
    state: o.state ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">
            Companies, foundations, sponsors, and partners we&rsquo;ve made
            contact with.
          </p>
        </div>
        <Link
          href="/orgs/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          Add organization
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No organizations yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add the first one to start tracking the relationship.
          </p>
          <Link
            href="/orgs/new"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add organization
          </Link>
        </div>
      ) : (
        <OrgsTable rows={rows} />
      )}
    </div>
  );
}
