import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canCreateVeteran, canReassignVeteran } from "@/lib/permissions";
import { listPhones } from "@/lib/db/phones";
import { listUsers } from "@/lib/db/users";
import { listVsos } from "@/lib/db/vsos";
import { VeteranForm } from "../veteran-form";

export const dynamic = "force-dynamic";

export default async function NewVeteranPage() {
  const session = await getSession();
  if (!canCreateVeteran(session)) redirect("/veterans");
  const canReassign = canReassignVeteran(session);

  const [users, vsos, phones] = await Promise.all([
    listUsers(),
    listVsos(),
    listPhones(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Add veteran</h1>
        <p className="text-sm text-muted-foreground">
          The only required field is First name. Fill in what you know now —
          the rest can come from later encounters.
        </p>
      </div>

      <VeteranForm
        canReassign={canReassign}
        assignees={users.map((u) => ({
          uid: u.uid,
          label: u.displayName ?? u.email,
        }))}
        vsos={vsos.map((v) => ({
          id: v.id,
          label: v.affiliation
            ? `${v.fullName} (${v.affiliation})`
            : v.fullName,
        }))}
        phones={phones
          .filter(
            (p) => p.status === "available" || p.status === "returned",
          )
          .map((p) => ({
            id: p.id,
            label: p.imeiSerial ? `${p.name} · ${p.imeiSerial}` : p.name,
          }))}
      />
    </div>
  );
}
