import Link from "next/link";
import { getSession } from "@/lib/firebase/session";
import { listResources } from "@/lib/db/resources";
import { ResourcesTable } from "./resources-table";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const [resources, session] = await Promise.all([
    listResources(),
    getSession(),
  ]);
  const canEdit = !!session;

  const rows = resources.map((r) => ({
    id: r.id,
    organizationName: r.organizationName,
    website: r.website ?? null,
    contactName: r.contactName ?? null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    services: r.services ?? null,
    description: r.description ?? null,
    eligibility: r.eligibility ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Community Resources
          </h1>
          <p className="text-sm text-muted-foreground">
            Outside organizations we point veterans to. Search by need — try
            &ldquo;rent assistance&rdquo; to find every org that offers it.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/resources/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add Resource
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No community resources yet.</p>
          {canEdit && (
            <Link
              href="/resources/new"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
            >
              Add the first resource
            </Link>
          )}
        </div>
      ) : (
        <ResourcesTable rows={rows} />
      )}
    </div>
  );
}
