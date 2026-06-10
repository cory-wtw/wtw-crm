import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getVso } from "@/lib/db/vsos";
import { VsoForm } from "../../vso-form";

export const dynamic = "force-dynamic";

export default async function EditVsoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const vso = await getVso(id);
  if (!vso) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          Edit {vso.fullName}
        </h1>
      </div>
      <VsoForm
        initial={{
          id: vso.id,
          values: {
            fullName: vso.fullName,
            affiliation: vso.affiliation ?? "",
            city: vso.city ?? "",
            state: vso.state ?? "",
            directPhone: vso.directPhone ?? "",
            directEmail: vso.directEmail ?? "",
            preferredContactMethod: vso.preferredContactMethod ?? "",
            partnershipStatus: vso.partnershipStatus,
            notes: vso.notes ?? "",
          },
        }}
      />
    </div>
  );
}
