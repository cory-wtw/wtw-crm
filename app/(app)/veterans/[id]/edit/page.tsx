import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canEditVeteran, canReassignVeteran } from "@/lib/permissions";
import { listPhones } from "@/lib/db/phones";
import { listRates } from "@/lib/db/rates";
import { listUsers } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { listVsos } from "@/lib/db/vsos";
import { formatUsd } from "@/lib/format";
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

  const [users, rates, vsos, phones] = await Promise.all([
    listUsers(),
    listRates(),
    listVsos(),
    listPhones(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          Edit {veteran.name}
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
        rates={rates.map((r) => ({
          code: r.rateCode,
          label: `${r.rateCode} · ${r.rating} ${rateDependentSuffix(r.dependentStatus)} · ${formatUsd(r.monthlyAmount)}/mo`,
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
    name: v.name,
    preferredName: v.preferredName ?? "",
    phone: v.phone ?? "",
    birthYear: v.birthYear?.toString() ?? "",
    yearlyIncome: v.yearlyIncome?.toString() ?? "",
    householdSize: v.householdSize?.toString() ?? "",
    dependentStatus: v.dependentStatus ?? "",
    branch: v.branch ?? "",
    dischargeStatus: v.dischargeStatus ?? "",
    serviceFrom: v.serviceFrom ?? "",
    serviceTo: v.serviceTo ?? "",
    housingStatus: v.housingStatus ?? "",
    assigneeUid: v.assigneeUid ?? "",
    pipelineStage: v.pipelineStage,
    lifeExpectancyAtFound: v.lifeExpectancyAtFound?.toString() ?? "",
    ageAtFound: v.ageAtFound?.toString() ?? "",
    anticipatedRateCode: v.anticipatedRateCode ?? "",
    actualRateCode: v.actualRateCode ?? "",
    vsoIds: v.vsoIds,
    assignedPhoneId: v.assignedPhoneId ?? "",
    notes: v.notes ?? "",
  };
}

function rateDependentSuffix(status: string): string {
  switch (status) {
    case "alone":
      return "alone";
    case "with_spouse":
      return "+ spouse";
    case "with_spouse_kids":
      return "+ spouse & kids";
    default:
      return "";
  }
}
