import { notFound, redirect } from "next/navigation";
import { getIntake } from "@/lib/db/intakes";
import { getVeteran } from "@/lib/db/veterans";
import { IntakeForm } from "../../intake-form";

export const dynamic = "force-dynamic";

export default async function EditIntakePage({
  params,
}: {
  params: Promise<{ id: string; intakeId: string }>;
}) {
  const { id, intakeId } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();
  const intake = await getIntake(id, intakeId);
  if (!intake) notFound();

  if (intake.status === "complete") {
    // Completed intakes are read-only; bounce to the view.
    redirect(`/veterans/${id}/intakes/${intakeId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Life & Service Intake · Draft
        </p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Tell us your story
        </h1>
        <p className="text-sm text-muted-foreground">For {veteran.name}.</p>
      </div>

      <IntakeForm
        veteranId={veteran.id}
        initial={{
          intakeId: intake.id,
          status: intake.status,
          values: {
            basics: {
              fullName: intake.basics.fullName ?? "",
              dateOfBirth: intake.basics.dateOfBirth ?? "",
              bestPhone: intake.basics.bestPhone ?? "",
              bestEmail: intake.basics.bestEmail ?? "",
              currentLocation: intake.basics.currentLocation ?? "",
              bestWayToReach: intake.basics.bestWayToReach ?? "",
            },
            service: {
              branches: intake.service.branches as string[],
              yearsServed: intake.service.yearsServed ?? "",
              rankAtDischarge: intake.service.rankAtDischarge ?? "",
              mos: intake.service.mos ?? "",
              dischargeStatus: intake.service.dischargeStatus ?? "",
              placesServed: intake.service.placesServed ?? "",
              combatExperience: intake.service.combatExperience ?? "",
              proudOf: intake.service.proudOf ?? "",
            },
            bodyDuringService: {
              injuries: intake.bodyDuringService.injuries ?? "",
              concussions: intake.bodyDuringService.concussions ?? "",
              exposures: intake.bodyDuringService.exposures ?? "",
              traumaStillWithYou:
                intake.bodyDuringService.traumaStillWithYou ?? "",
            },
            bodyToday: {
              headBrainMemory: intake.bodyToday.headBrainMemory ?? "",
              vision: intake.bodyToday.vision ?? "",
              backNeckSpine: intake.bodyToday.backNeckSpine ?? "",
              breathing: intake.bodyToday.breathing ?? "",
              kneesAnklesFeet: intake.bodyToday.kneesAnklesFeet ?? "",
              stomach: intake.bodyToday.stomach ?? "",
              shoulders: intake.bodyToday.shoulders ?? "",
              skin: intake.bodyToday.skin ?? "",
              hearing: intake.bodyToday.hearing ?? "",
              other: intake.bodyToday.other ?? "",
              dailyLifeImpact: intake.bodyToday.dailyLifeImpact ?? "",
            },
            sleep: intake.sleep as string[],
            mentalHealth: intake.mentalHealth as string[],
            coping: intake.coping as string[],
            housing: intake.housing ?? "",
            housingOther: intake.housingOther ?? "",
            income: intake.income as string[],
            vaCare: {
              enrollment: intake.vaCare.enrollment ?? "",
              rating: intake.vaCare.rating ?? "",
              ratingValue: intake.vaCare.ratingValue ?? "",
              priorClaimOutcome: intake.vaCare.priorClaimOutcome ?? "",
            },
            openQuestions: {
              normalDay: intake.openQuestions.normalDay ?? "",
              countingOn: intake.openQuestions.countingOn ?? "",
              otherSupport: intake.openQuestions.otherSupport ?? "",
              feelingAtSeparation:
                intake.openQuestions.feelingAtSeparation ?? "",
            },
            documents: Object.fromEntries(
              Object.entries(intake.documents).map(([k, v]) => [
                k,
                { status: (v.status as string) ?? "", notes: v.notes ?? "" },
              ]),
            ) as Record<string, { status: string; notes: string }>,
            buddyContacts:
              intake.buddyContacts.length > 0
                ? intake.buddyContacts.map((b) => ({
                    name: b.name ?? "",
                    howToReach: b.howToReach ?? "",
                  }))
                : Array.from({ length: 4 }, () => ({
                    name: "",
                    howToReach: "",
                  })),
            vsoBestFit: {
              types: intake.vsoBestFit.types as string[],
              stateLivesIn: intake.vsoBestFit.stateLivesIn ?? "",
              specialized: intake.vsoBestFit.specialized ?? "",
            },
            liaisonHandoff: {
              threadsWorthFollowing:
                intake.liaisonHandoff.threadsWorthFollowing ?? "",
              urgency: intake.liaisonHandoff.urgency ?? "",
            },
            nextContact: {
              when: intake.nextContact.when ?? "",
              where: intake.nextContact.where ?? "",
              how: intake.nextContact.how ?? "",
            },
            liaisonSignature: {
              name: intake.liaisonSignature.name ?? "",
            },
          },
        }}
      />
    </div>
  );
}
