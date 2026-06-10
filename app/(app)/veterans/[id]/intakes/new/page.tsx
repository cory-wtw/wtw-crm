import { notFound } from "next/navigation";
import { getVeteran } from "@/lib/db/veterans";
import {
  veteranBranchToIntake,
  veteranHousingToIntake,
} from "@/lib/intake-veteran-sync";
import { IntakeForm } from "../intake-form";

export const dynamic = "force-dynamic";

export default async function NewIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  // Prefill the intake from whatever the veteran record already has so the
  // liaison isn't re-asking what we already know. Auto-sync pushes any
  // edits back to the veteran row when the intake saves.
  const prefill = {
    basics: {
      fullName: veteran.name ?? "",
      bestPhone: veteran.phone ?? "",
      bestEmail: "",
      dateOfBirth: "",
      currentLocation: "",
      bestWayToReach: "",
    },
    housing: (veteranHousingToIntake(veteran.housingStatus ?? null) ??
      "") as
      | ""
      | "unsheltered"
      | "shelter"
      | "couch_surfing"
      | "vehicle"
      | "renting"
      | "own_home"
      | "transitional"
      | "other",
    service: {
      branches: veteranBranchToIntake(veteran.branch ?? null),
      yearsServed: "",
      rankAtDischarge: "",
      mos: "",
      dischargeStatus: (veteran.dischargeStatus ?? "") as
        | ""
        | "honorable"
        | "general"
        | "oth"
        | "bcd"
        | "dd"
        | "unknown",
      placesServed: "",
      combatExperience: "",
      proudOf: "",
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Life & Service Intake
        </p>
        <h1 className="text-3xl font-black tracking-tight">
          Tell us your story
        </h1>
        <p className="text-sm text-muted-foreground">
          A conversation. Not a form. For {veteran.name}. One sitting, 30–45
          minutes. Skip anything that doesn&rsquo;t fit. Save draft anytime;
          mark complete when ready to send to a VSO. Basics + service info
          are prefilled from the veteran record — edits flow back
          automatically.
          {veteran.birthYear && (
            <>
              {" "}
              Known birth year: <strong>{veteran.birthYear}</strong>.
            </>
          )}
        </p>
      </div>

      <IntakeForm
        veteranId={veteran.id}
        initial={{
          intakeId: "",
          status: "draft",
          values: prefill,
        }}
      />
    </div>
  );
}
