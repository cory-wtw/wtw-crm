import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canEditVeteran, canReassignVeteran } from "@/lib/permissions";
import { listPhones } from "@/lib/db/phones";
import { listUsers } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { listVsos } from "@/lib/db/vsos";
import { formatShortName } from "@/lib/name";
import type { Veteran } from "@/lib/schemas";
import { VeteranForm } from "../../veteran-form";

export const dynamic = "force-dynamic";

export default async function EditVeteranPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  const session = await getSession();
  if (!canEditVeteran(session, veteran)) {
    redirect(`/veterans/${id}`);
  }
  const canReassign = canReassignVeteran(session);

  const [users, vsos, phones] = await Promise.all([
    listUsers(),
    listVsos(),
    listPhones(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Edit {formatShortName(veteran.firstName, veteran.lastInitial)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Stage changes append a pipeline history entry and stamp the
          corresponding date field automatically.
        </p>
      </div>

      <VeteranForm
        initial={{ id: veteran.id, values: veteranToFormValues(veteran) }}
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
        phones={phones.map((p) => ({
          id: p.id,
          label: p.imeiSerial ? `${p.name} · ${p.imeiSerial}` : p.name,
        }))}
      />
    </div>
  );
}

function veteranToFormValues(v: Veteran) {
  return {
    firstName: v.firstName,
    lastInitial: v.lastInitial ?? "",
    preferredContact: v.preferredContact,
    phone: v.phone ?? "",
    email: v.email ?? "",
    birthYear: v.birthYear?.toString() ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    assigneeUid: v.assigneeUid ?? "",
    pipelineStage: v.pipelineStage,
    dependentStatus: v.dependentStatus,
    ratingBefore: v.ratingBefore.toString(),
    ratingAfter: v.ratingAfter.toString(),
    vsoIds: v.vsoIds,
    assignedPhoneId: v.assignedPhoneId ?? "",
  };
}
