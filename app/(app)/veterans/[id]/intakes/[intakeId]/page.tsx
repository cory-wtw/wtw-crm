import Link from "next/link";
import { notFound } from "next/navigation";
import { getIntake } from "@/lib/db/intakes";
import { getUser } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { formatDate } from "@/lib/format";
import {
  COPING_OPTION_LABELS,
  type CopingOption,
  DISCHARGE_STATUS_LABELS,
  DOC_STATUS_LABELS,
  HEARING_FREQUENCY_LABELS,
  HOUSING_SITUATION_LABELS,
  INCOME_SOURCE_LABELS,
  type IncomeSource,
  INTAKE_BRANCH_LABELS,
  type IntakeBranch,
  INTAKE_DOC_KEYS,
  INTAKE_DOC_LABELS,
  type IntakeDocKey,
  MENTAL_HEALTH_OPTION_LABELS,
  type MentalHealthOption,
  SKIN_FREQUENCY_LABELS,
  SLEEP_OPTION_LABELS,
  type SleepOption,
  STANDARD_FREQUENCY_LABELS,
  VA_ENROLLMENT_LABELS,
  VA_RATING_STATUS_LABELS,
  VSO_BEST_FIT_LABELS,
  type VsoBestFitType,
} from "@/lib/schemas";
import { ReopenIntakeButton } from "./reopen-button";

export const dynamic = "force-dynamic";

export default async function IntakeViewPage({
  params,
}: {
  params: Promise<{ id: string; intakeId: string }>;
}) {
  const { id, intakeId } = await params;
  const [veteran, intake] = await Promise.all([
    getVeteran(id),
    getIntake(id, intakeId),
  ]);
  if (!veteran || !intake) notFound();
  const liaison = intake.liaisonUid ? await getUser(intake.liaisonUid) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Life & Service Intake ·{" "}
            {intake.status === "complete" ? "Complete" : "Draft"}
          </p>
          <h1 className="text-3xl font-black tracking-tight">
            {veteran.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {intake.completedAt
              ? `Completed ${formatDate(intake.completedAt)}`
              : `Last updated ${formatDate(intake.updatedAt)}`}
            {liaison && (
              <> · Liaison: {liaison.displayName ?? liaison.email}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/veterans/${veteran.id}/intakes/${intake.id}/pdf`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Download PDF
          </a>
          {intake.status === "draft" ? (
            <Link
              href={`/veterans/${veteran.id}/intakes/${intake.id}/edit`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
            >
              Continue editing
            </Link>
          ) : (
            <ReopenIntakeButton veteranId={veteran.id} intakeId={intake.id} />
          )}
          <Link
            href={`/veterans/${veteran.id}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Back to veteran
          </Link>
        </div>
      </div>

      <SectionCard number="01" title="General Information">
        <Sub title="The Basics">
          <Row label="Full name" value={intake.basics.fullName} />
          <Row label="Date of birth" value={intake.basics.dateOfBirth} />
          <Row label="Best phone" value={intake.basics.bestPhone} />
          <Row label="Best email" value={intake.basics.bestEmail} />
          <Row
            label="Where staying"
            value={intake.basics.currentLocation}
            wide
          />
          <Row
            label="Best way to reach"
            value={intake.basics.bestWayToReach}
            wide
          />
        </Sub>
        <Sub title="Your Service">
          <Row
            label="Branches"
            value={
              intake.service.branches.length
                ? intake.service.branches
                    .map((b) => INTAKE_BRANCH_LABELS[b as IntakeBranch])
                    .join(", ")
                : null
            }
            wide
          />
          <Row label="Years served" value={intake.service.yearsServed} />
          <Row label="Rank at discharge" value={intake.service.rankAtDischarge} />
          <Row label="MOS / Job" value={intake.service.mos} />
          <Row
            label="Discharge status"
            value={
              intake.service.dischargeStatus
                ? DISCHARGE_STATUS_LABELS[intake.service.dischargeStatus]
                : null
            }
          />
          <LongRow label="Places served" value={intake.service.placesServed} />
          <LongRow
            label="Combat experience"
            value={intake.service.combatExperience}
          />
          <LongRow label="Proud of" value={intake.service.proudOf} />
        </Sub>
      </SectionCard>

      <SectionCard number="02" title="What Happened & Your Body">
        <Sub title="During Service">
          <LongRow
            label="Injuries"
            value={intake.bodyDuringService.injuries}
          />
          <LongRow
            label="Concussions / TBI"
            value={intake.bodyDuringService.concussions}
          />
          <LongRow
            label="Exposures"
            value={intake.bodyDuringService.exposures}
          />
          <LongRow
            label="Trauma still with you"
            value={intake.bodyDuringService.traumaStillWithYou}
          />
        </Sub>
        <Sub title="Body Today">
          <FreqRow
            label="Head / brain / memory"
            value={intake.bodyToday.headBrainMemory}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Vision"
            value={intake.bodyToday.vision}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Back / neck / spine"
            value={intake.bodyToday.backNeckSpine}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Breathing"
            value={intake.bodyToday.breathing}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Knees / ankles / feet"
            value={intake.bodyToday.kneesAnklesFeet}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Stomach"
            value={intake.bodyToday.stomach}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Shoulders / hands"
            value={intake.bodyToday.shoulders}
            labels={STANDARD_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Skin"
            value={intake.bodyToday.skin}
            labels={SKIN_FREQUENCY_LABELS}
          />
          <FreqRow
            label="Hearing"
            value={intake.bodyToday.hearing}
            labels={HEARING_FREQUENCY_LABELS}
          />
          <LongRow
            label="Other body issues"
            value={intake.bodyToday.other}
          />
          <LongRow
            label="Daily life impact"
            value={intake.bodyToday.dailyLifeImpact}
          />
        </Sub>
      </SectionCard>

      <SectionCard number="03" title="Mind, Daily Life, & Care">
        <Sub title="Checkboxes">
          <Row
            label="Sleep"
            value={joinLabels(intake.sleep, SLEEP_OPTION_LABELS as Record<SleepOption, string>)}
            wide
          />
          <Row
            label="Mental health"
            value={joinLabels(
              intake.mentalHealth,
              MENTAL_HEALTH_OPTION_LABELS as Record<MentalHealthOption, string>,
            )}
            wide
          />
          <Row
            label="Coping"
            value={joinLabels(intake.coping, COPING_OPTION_LABELS as Record<CopingOption, string>)}
            wide
          />
          <Row
            label="Housing"
            value={
              intake.housing
                ? HOUSING_SITUATION_LABELS[intake.housing]
                : null
            }
          />
          <Row
            label="Income"
            value={joinLabels(intake.income, INCOME_SOURCE_LABELS as Record<IncomeSource, string>)}
          />
        </Sub>
        <Sub title="VA Care">
          <Row
            label="Enrollment"
            value={
              intake.vaCare.enrollment
                ? VA_ENROLLMENT_LABELS[intake.vaCare.enrollment]
                : null
            }
          />
          <Row
            label="Rating"
            value={
              intake.vaCare.rating
                ? VA_RATING_STATUS_LABELS[intake.vaCare.rating]
                : null
            }
          />
          <Row label="Rating value" value={intake.vaCare.ratingValue} />
          <Row
            label="Prior claim outcome"
            value={intake.vaCare.priorClaimOutcome}
          />
        </Sub>
        <Sub title="Open Questions">
          <LongRow
            label="Normal day"
            value={intake.openQuestions.normalDay}
          />
          <LongRow
            label="Counting on / counted on"
            value={intake.openQuestions.countingOn}
          />
          <LongRow
            label="Other support"
            value={intake.openQuestions.otherSupport}
          />
          <LongRow
            label="At separation"
            value={intake.openQuestions.feelingAtSeparation}
          />
        </Sub>
      </SectionCard>

      <SectionCard number="04" title="Documents & Handoff">
        <Sub title="Documents">
          {INTAKE_DOC_KEYS.map((key) => {
            const item = intake.documents[key as IntakeDocKey];
            const meta = INTAKE_DOC_LABELS[key as IntakeDocKey];
            return (
              <div
                key={key}
                className="md:col-span-2 flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-bold">{meta.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {meta.subtitle}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">
                    {item.status
                      ? DOC_STATUS_LABELS[item.status]
                      : "—"}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground">
                      {item.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </Sub>
        <Sub title="Buddy Contacts">
          {intake.buddyContacts.length === 0 ? (
            <p className="md:col-span-2 text-sm text-muted-foreground">—</p>
          ) : (
            intake.buddyContacts.map((b, i) => (
              <Row
                key={i}
                label={b.name || `Contact ${i + 1}`}
                value={b.howToReach}
                wide
              />
            ))
          )}
        </Sub>
        <Sub title="VSO Best Fit">
          <Row
            label="Types"
            value={joinLabels(
              intake.vsoBestFit.types,
              VSO_BEST_FIT_LABELS as Record<VsoBestFitType, string>,
            )}
            wide
          />
          <Row label="State (lives in)" value={intake.vsoBestFit.stateLivesIn} />
          <Row label="Specialized" value={intake.vsoBestFit.specialized} />
        </Sub>
        <Sub title="Liaison Notes">
          <LongRow
            label="Threads worth following"
            value={intake.liaisonHandoff.threadsWorthFollowing}
          />
          <LongRow label="Urgency" value={intake.liaisonHandoff.urgency} />
        </Sub>
        <Sub title="Next Contact">
          <Row label="When" value={intake.nextContact.when} />
          <Row label="Where" value={intake.nextContact.where} />
          <Row label="How" value={intake.nextContact.how} />
        </Sub>
        <Sub title="Veteran Liaison">
          <Row label="Signature / name" value={intake.liaisonSignature.name} />
          <Row
            label="Date"
            value={
              intake.completedAt ? formatDate(intake.completedAt) : null
            }
          />
        </Sub>
      </SectionCard>

      <p className="rounded-md border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
        Worth Their Weight is not a law firm and does not provide legal
        representation before the U.S. Department of Veterans Affairs. All
        claims-related services are performed by VA-accredited attorneys,
        agents, or Veterans Service Organizations. Worth Their Weight is a
        501(c)(3) nonprofit organization, status pending.
      </p>
    </div>
  );
}

// ---- presentational helpers ----

function joinLabels<T extends string>(
  values: T[],
  labels: Record<T, string>,
): string | null {
  if (!values || values.length === 0) return null;
  return values.map((v) => labels[v]).join(", ");
}

function SectionCard({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="-mx-6 -mt-6 mb-5 rounded-t-lg bg-gradient-to-r from-[color:var(--wtw-deep-gold)]/30 to-[color:var(--wtw-brand-gold)]/30 px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Section {number}
        </p>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Sub({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="rounded-md bg-[color:var(--wtw-brand-gold)]/20 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em]">
        {title}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-0.5 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function LongRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="md:col-span-2 space-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">{value || "—"}</p>
    </div>
  );
}

function FreqRow<T extends string>({
  label,
  value,
  labels,
}: {
  label: string;
  value: T | null;
  labels: Record<T, string>;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value ? labels[value] : "—"}</p>
    </div>
  );
}
