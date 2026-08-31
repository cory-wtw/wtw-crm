import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import {
  canDeleteVeteran,
  canEditVeteran,
  canRunIntake,
} from "@/lib/permissions";
import { listEncounters } from "@/lib/db/encounters";
import { getPhone } from "@/lib/db/phones";
import { getUser, listUsers } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { getVsosByIds } from "@/lib/db/vsos";
import { formatDate, formatUsd } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { DeleteVeteranButton } from "./delete-veteran-button";
import {
  BUCKET_LABELS,
  CONCIERGE_STATUS_LABELS,
  DEPENDENTS_ANSWER_LABELS,
  DISCHARGE_CHARACTER_LABELS,
  ENCOUNTER_TYPE_LABELS,
  ID_STATUS_LABELS,
  monthlyBenefitLift,
  PIPELINE_LABELS,
  PREFERRED_CONTACT_LABELS,
  type IntakeAnswers as IntakeAnswersType,
  type PipelineStage,
  SERVICE_ERA_LABELS,
} from "@/lib/schemas";
import { EncounterForm } from "./encounter-form";
import { StageChanger } from "./stage-changer";

export const dynamic = "force-dynamic";

const STAGE_TINT: Record<PipelineStage, string> = {
  found: "bg-secondary text-foreground",
  connected:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  filed: "bg-primary/20 text-foreground",
  won: "bg-primary text-primary-foreground",
  lost: "bg-muted text-muted-foreground",
};

export default async function VeteranDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  const [assignee, vsos, phone, encounters, allUsers, session] =
    await Promise.all([
      veteran.assigneeUid ? getUser(veteran.assigneeUid) : null,
      getVsosByIds(veteran.vsoIds),
      veteran.assignedPhoneId
        ? getPhone(veteran.assignedPhoneId)
        : null,
      listEncounters(veteran.id),
      listUsers(),
      getSession(),
    ]);

  const shortName = formatShortName(veteran.firstName, veteran.lastInitial);

  const canEdit = canEditVeteran(session, veteran);
  const canDelete = canDeleteVeteran(session);
  const canIntake = canRunIntake(session, veteran);

  const usersByUid = new Map(allUsers.map((u) => [u.uid, u]));
  function nameForUid(uid: string): string {
    if (uid === "system-import") return "Import";
    const u = usersByUid.get(uid);
    if (!u) return "Unknown";
    return u.displayName ?? u.email;
  }

  const monthlyLift = monthlyBenefitLift(
    veteran.monthlyBenefitBefore,
    veteran.monthlyBenefitAfter,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {shortName}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STAGE_TINT[veteran.pipelineStage]}`}
            >
              {PIPELINE_LABELS[veteran.pipelineStage]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canIntake && (
            <Link
              href={`/veterans/${veteran.id}/intake`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
            >
              Run intake
            </Link>
          )}
          {canEdit && (
            <Link
              href={`/veterans/${veteran.id}/edit`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
            >
              Edit
            </Link>
          )}
          {canDelete && (
            <DeleteVeteranButton
              veteranId={veteran.id}
              veteranName={shortName}
            />
          )}
        </div>
      </div>

      <Card title="Identity & contact">
        <Row
          label="Preferred contact"
          value={PREFERRED_CONTACT_LABELS[veteran.preferredContact]}
        />
        <Row
          label={veteran.preferredContact === "email" ? "Email" : "Phone"}
          value={
            veteran.preferredContact === "email"
              ? veteran.email
              : veteran.phone
          }
        />
        <Row
          label="Birth year"
          value={veteran.birthYear?.toString() ?? null}
        />
        <Row
          label="Location"
          value={
            [veteran.city, veteran.state].filter(Boolean).join(", ") || null
          }
        />
        <Row
          label="Assignee"
          value={
            assignee ? (assignee.displayName ?? assignee.email) : "Unassigned"
          }
        />
      </Card>

      <Card title="Eligibility keys">
        <Row
          label="Discharge"
          value={
            veteran.dischargeCharacter
              ? DISCHARGE_CHARACTER_LABELS[veteran.dischargeCharacter]
              : null
          }
        />
        <Row
          label="Service era"
          value={
            veteran.serviceEra ? SERVICE_ERA_LABELS[veteran.serviceEra] : null
          }
        />
        <Row
          label="ID"
          value={veteran.idStatus ? ID_STATUS_LABELS[veteran.idStatus] : null}
        />
        <Row
          label="Dependents"
          value={
            veteran.hasDependents
              ? DEPENDENTS_ANSWER_LABELS[veteran.hasDependents]
              : null
          }
        />
      </Card>

      <Card title="Concierge">
        <Row
          label="Status"
          value={
            veteran.conciergeStatus
              ? CONCIERGE_STATUS_LABELS[veteran.conciergeStatus]
              : CONCIERGE_STATUS_LABELS.none
          }
        />
        <Row label="Follow-up due" value={formatDate(veteran.followUpDue)} />
      </Card>

      <Card title="Pipeline">
        <Row label="Stage" value={PIPELINE_LABELS[veteran.pipelineStage]} />
        <Row label="Date found" value={formatDate(veteran.dateFound)} />
        <Row label="Date connected" value={formatDate(veteran.dateConnected)} />
        <Row label="Date filed" value={formatDate(veteran.dateFiled)} />
        <Row label="Date won" value={formatDate(veteran.dateWon)} />
        <Row label="Date lost" value={formatDate(veteran.dateLost)} />
        {canEdit && (
          <div className="md:col-span-2 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Change stage
            </p>
            <StageChanger
              veteranId={veteran.id}
              currentStage={veteran.pipelineStage}
            />
          </div>
        )}
      </Card>

      <Card title="Monthly benefit">
        <Row
          label="Before WTW"
          value={formatUsd(veteran.monthlyBenefitBefore)}
        />
        <Row
          label="After WTW"
          value={formatUsd(veteran.monthlyBenefitAfter)}
        />
        <Row
          label="WTW monthly impact"
          value={monthlyLift ? formatUsd(monthlyLift) : "—"}
        />
      </Card>

      <Card title="VSO partners">
        {vsos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No VSO partners linked yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {vsos.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/vsos/${v.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {v.fullName}
                </Link>
                {v.affiliation && (
                  <span className="text-muted-foreground"> · {v.affiliation}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Phone">
        <Row label="Assigned phone" value={phone?.name ?? null} />
        <Row label="IMEI / Serial" value={phone?.imeiSerial ?? null} />
      </Card>

      <Card title="Pipeline history">
        {veteran.pipelineHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="md:col-span-2 space-y-2 text-sm">
            {veteran.pipelineHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="inline-flex w-20 shrink-0 items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">
                    {PIPELINE_LABELS[h.stage]}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(h.enteredAt)}
                    {h.byUid && (
                      <span> · {nameForUid(h.byUid)}</span>
                    )}
                  </span>
                </li>
              ))}
          </ol>
        )}
      </Card>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Encounters ({encounters.length})
          </h2>
          <EncounterForm veteranId={veteran.id} />
        </div>
        {encounters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No encounters logged yet. Tap &ldquo;Log encounter&rdquo; above.
          </p>
        ) : (
          <ol className="space-y-4">
            {encounters.map((e) => (
              <li
                key={e.id}
                className="border-l-2 border-[color:var(--wtw-brand-gold)] pl-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold">
                    {e.type !== "note" && (
                      <span className="mr-2 inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">
                        {ENCOUNTER_TYPE_LABELS[e.type]}
                      </span>
                    )}
                    {formatDate(e.occurredAt)}
                    {e.location && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.location}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Logged by {nameForUid(e.loggedBy)}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{e.summary}</p>
                {e.bucketsIdentified.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {e.bucketsIdentified.map((bucket) => (
                      <li
                        key={bucket}
                        className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                      >
                        {BUCKET_LABELS[bucket]}
                      </li>
                    ))}
                  </ul>
                )}
                {e.type === "intake" && <IntakeAnswers answers={e.intakeAnswers} />}
                {e.referrals.length > 0 && (
                  <ol className="mt-2 space-y-0.5 text-xs">
                    {e.referrals.map((referral) => (
                      <li key={referral.resourceId}>
                        <span className="text-muted-foreground">
                          {referral.rank + 1}.{" "}
                        </span>
                        <Link
                          href={`/resources/${referral.resourceId}`}
                          className="font-bold underline-offset-4 hover:underline"
                        >
                          {referral.resourceName}
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                {e.followUpDue && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Follow-up due {formatDate(e.followUpDue)}
                    {e.followUpCompleted &&
                      ` · completed ${formatDate(e.followUpCompleted)}`}
                  </p>
                )}
                {e.nextStep && (
                  <p className="mt-2 text-xs">
                    <span className="font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
                      Next step
                    </span>{" "}
                    {e.nextStep}
                    {e.nextStepDueAt && (
                      <span className="text-muted-foreground">
                        {" "}
                        · due {formatDate(e.nextStepDueAt)}
                      </span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * The eligibility picture an intake ran against.
 *
 * Worth showing beside the needs: an intake that matched nobody is either a
 * thin directory or an answer that closed every door, and these are the four
 * values that decide which. An answer nobody has given is left out rather than
 * shown as a blank — the gates treat unknown and "no" differently, and so
 * should the record of them.
 */
function IntakeAnswers({ answers }: { answers: IntakeAnswersType }) {
  const rows: [string, string | undefined][] = [
    [
      "Discharge",
      answers.dischargeCharacter
        ? DISCHARGE_CHARACTER_LABELS[answers.dischargeCharacter]
        : undefined,
    ],
    [
      "Era",
      answers.serviceEra ? SERVICE_ERA_LABELS[answers.serviceEra] : undefined,
    ],
    ["ID", answers.idStatus ? ID_STATUS_LABELS[answers.idStatus] : undefined],
    [
      "Dependents",
      answers.hasDependents
        ? DEPENDENTS_ANSWER_LABELS[answers.hasDependents]
        : undefined,
    ],
  ];
  const known = rows.filter(([, value]) => value);
  if (known.length === 0) return null;

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Matched on:{" "}
      {known.map(([label, value]) => `${label} ${value}`).join(" · ")}
    </p>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
        {title}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
