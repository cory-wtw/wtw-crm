import Link from "next/link";
import { notFound } from "next/navigation";
import { getPhone } from "@/lib/db/phones";
import { getRate } from "@/lib/db/rates";
import { getUser } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { getVsosByIds } from "@/lib/db/vsos";
import { formatDate, formatUsd } from "@/lib/format";
import {
  BRANCH_LABELS,
  DEPENDENT_STATUS_LABELS,
  DISCHARGE_STATUS_LABELS,
  HOUSING_STATUS_LABELS,
  lifetimeBenefit,
  PIPELINE_LABELS,
  type PipelineStage,
} from "@/lib/schemas";

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

  const [assignee, anticipatedRate, actualRate, vsos, phone] =
    await Promise.all([
      veteran.assigneeUid ? getUser(veteran.assigneeUid) : null,
      veteran.anticipatedRateCode
        ? getRate(veteran.anticipatedRateCode)
        : null,
      veteran.actualRateCode ? getRate(veteran.actualRateCode) : null,
      getVsosByIds(veteran.vsoIds),
      veteran.assignedPhoneId
        ? getPhone(veteran.assignedPhoneId)
        : null,
    ]);

  const anticipatedMonthly = anticipatedRate?.monthlyAmount ?? null;
  const actualMonthly = actualRate?.monthlyAmount ?? null;
  const anticipatedLifetime = lifetimeBenefit(
    anticipatedMonthly,
    veteran.lifeExpectancyAtFound,
  );
  const actualLifetime = lifetimeBenefit(
    actualMonthly,
    veteran.lifeExpectancyAtFound,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight">
              {veteran.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STAGE_TINT[veteran.pipelineStage]}`}
            >
              {PIPELINE_LABELS[veteran.pipelineStage]}
            </span>
          </div>
          {veteran.preferredName && (
            <p className="text-sm text-muted-foreground">
              Goes by {veteran.preferredName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/veterans/${veteran.id}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Edit
          </Link>
        </div>
      </div>

      <Card title="Identity">
        <Row label="Phone" value={veteran.phone} />
        <Row
          label="Assignee"
          value={
            assignee ? (assignee.displayName ?? assignee.email) : "Unassigned"
          }
        />
      </Card>

      <Card title="Demographics">
        <Row
          label="Birth year"
          value={veteran.birthYear?.toString() ?? null}
        />
        <Row label="Yearly income" value={formatUsd(veteran.yearlyIncome)} />
        <Row
          label="Household size"
          value={veteran.householdSize?.toString() ?? null}
        />
        <Row
          label="Dependent status"
          value={
            veteran.dependentStatus
              ? DEPENDENT_STATUS_LABELS[veteran.dependentStatus]
              : null
          }
        />
      </Card>

      <Card title="Service">
        <Row
          label="Branch"
          value={veteran.branch ? BRANCH_LABELS[veteran.branch] : null}
        />
        <Row
          label="Discharge status"
          value={
            veteran.dischargeStatus
              ? DISCHARGE_STATUS_LABELS[veteran.dischargeStatus]
              : null
          }
        />
        <Row label="Service from" value={veteran.serviceFrom} />
        <Row label="Service to" value={veteran.serviceTo} />
        <Row
          label="Housing status"
          value={
            veteran.housingStatus
              ? HOUSING_STATUS_LABELS[veteran.housingStatus]
              : null
          }
        />
      </Card>

      <Card title="Pipeline">
        <Row label="Stage" value={PIPELINE_LABELS[veteran.pipelineStage]} />
        <Row label="Date found" value={formatDate(veteran.dateFound)} />
        <Row label="Date connected" value={formatDate(veteran.dateConnected)} />
        <Row label="Date filed" value={formatDate(veteran.dateFiled)} />
        <Row label="Date won" value={formatDate(veteran.dateWon)} />
        <Row label="Date lost" value={formatDate(veteran.dateLost)} />
      </Card>

      <Card title="Benefits">
        <Row
          label="Life expectancy at found"
          value={
            veteran.lifeExpectancyAtFound
              ? `${veteran.lifeExpectancyAtFound} years`
              : null
          }
        />
        <Row
          label="Age at found"
          value={veteran.ageAtFound?.toString() ?? null}
        />
        <Row
          label="Anticipated rate"
          value={
            anticipatedRate
              ? `${anticipatedRate.rateCode} (${anticipatedRate.rating})`
              : null
          }
        />
        <Row
          label="Anticipated monthly"
          value={formatUsd(anticipatedMonthly)}
        />
        <Row
          label="Anticipated lifetime"
          value={anticipatedLifetime ? formatUsd(anticipatedLifetime) : "—"}
        />
        <Row
          label="Actual rate"
          value={
            actualRate
              ? `${actualRate.rateCode} (${actualRate.rating})`
              : null
          }
        />
        <Row label="Actual monthly" value={formatUsd(actualMonthly)} />
        <Row
          label="Actual lifetime"
          value={actualLifetime ? formatUsd(actualLifetime) : "—"}
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

      {veteran.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-wrap text-sm">{veteran.notes}</p>
        </Card>
      )}

      <Card title="Pipeline history">
        {veteran.pipelineHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {veteran.pipelineHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="inline-flex w-20 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">
                    {PIPELINE_LABELS[h.stage]}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(h.enteredAt)}
                  </span>
                </li>
              ))}
          </ol>
        )}
      </Card>

      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Encounter timeline + the stage-changer come next. Edit the veteran to
        update fields in the meantime.
      </div>
    </div>
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
