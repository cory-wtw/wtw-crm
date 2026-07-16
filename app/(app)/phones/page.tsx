import Link from "next/link";
import { getSession } from "@/lib/firebase/session";
import { listPhones } from "@/lib/db/phones";
import { listVeterans } from "@/lib/db/veterans";
import { PhonesTable } from "./phones-table";

export const dynamic = "force-dynamic";

export default async function PhonesPage() {
  const [phones, session, veterans] = await Promise.all([
    listPhones(),
    getSession(),
    listVeterans(),
  ]);
  const canEdit = !!session;

  const veteransByPhone = new Map<string, string>();
  for (const v of veterans) {
    if (v.assignedPhoneId) {
      veteransByPhone.set(v.assignedPhoneId, v.name);
    }
  }

  const rows = phones.map((p) => ({
    id: p.id,
    name: p.name,
    imeiSerial: p.imeiSerial ?? null,
    status: p.status,
    holder: veteransByPhone.get(p.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Phones</h1>
          <p className="text-sm text-muted-foreground">
            Straight Talk loaners we hand out to veterans during outreach.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/phones/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add phone
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">No phones in inventory yet.</p>
          {canEdit && (
            <Link
              href="/phones/new"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
            >
              Add the first phone
            </Link>
          )}
        </div>
      ) : (
        <PhonesTable rows={rows} />
      )}
    </div>
  );
}
