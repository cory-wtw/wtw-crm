import Link from "next/link";
import { getSession } from "@/lib/firebase/session";
import { listVsos } from "@/lib/db/vsos";
import { VsosTable } from "./vsos-table";

export const dynamic = "force-dynamic";

export default async function VsosPage() {
  const [vsos, session] = await Promise.all([listVsos(), getSession()]);
  const isAdmin = session?.role === "admin";

  const rows = vsos.map((v) => ({
    id: v.id,
    fullName: v.fullName,
    affiliation: v.affiliation ?? null,
    city: v.city ?? null,
    state: v.state ?? null,
    partnershipStatus: v.partnershipStatus,
    referralsMade: v.referralsMade,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">VSOs</h1>
          <p className="text-sm text-muted-foreground">
            The national rolodex of VA-accredited partners we hand veterans
            off to.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/vsos/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add VSO
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No VSOs yet.</p>
          {isAdmin ? (
            <Link
              href="/vsos/new"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
            >
              Add the first VSO
            </Link>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Ask an admin to add the first one.
            </p>
          )}
        </div>
      ) : (
        <VsosTable rows={rows} />
      )}
    </div>
  );
}
