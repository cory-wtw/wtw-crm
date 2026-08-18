import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVeteran } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { formatShortName } from "@/lib/name";
import { canRunIntake } from "@/lib/permissions";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  const session = await getSession();
  if (!canRunIntake(session, veteran)) redirect(`/veterans/${id}`);

  const shortName = formatShortName(veteran.firstName, veteran.lastInitial);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Intake · {shortName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Work down the page while you talk. Nothing sends until you say so.
          </p>
        </div>
        <Link
          href={`/veterans/${id}`}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to record
        </Link>
      </div>

      <IntakeForm
        veteranId={veteran.id}
        veteranName={shortName}
        // Location comes off the record — don't make staff re-ask what we know.
        knownCity={veteran.city ?? null}
        knownState={veteran.state ?? null}
        initial={{
          dischargeCharacter: veteran.dischargeCharacter ?? "",
          serviceEra: veteran.serviceEra ?? "",
          idStatus: veteran.idStatus ?? "",
          hasDependents: veteran.hasDependents ?? "",
        }}
      />
    </div>
  );
}
