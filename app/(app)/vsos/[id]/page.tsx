import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getVso } from "@/lib/db/vsos";
import { listVeteransByVsoId } from "@/lib/db/veterans";
import { formatDate } from "@/lib/format";
import {
  PARTNERSHIP_STATUS_LABELS,
  type PartnershipStatus,
  PIPELINE_LABELS,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

const STATUS_TINT: Record<PartnershipStatus, string> = {
  active_partner: "bg-primary text-primary-foreground",
  in_discussion:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  inactive: "bg-muted text-muted-foreground",
  declined: "bg-secondary text-muted-foreground",
};

const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  text: "Text",
  in_person: "In person",
};

export default async function VsoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vso, session, veterans] = await Promise.all([
    getVso(id),
    getSession(),
    listVeteransByVsoId(id),
  ]);
  if (!vso) notFound();
  const isAdmin = session?.role === "admin";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight">
              {vso.fullName}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_TINT[vso.partnershipStatus]}`}
            >
              {PARTNERSHIP_STATUS_LABELS[vso.partnershipStatus]}
            </span>
          </div>
          {vso.affiliation && (
            <p className="text-sm text-muted-foreground">{vso.affiliation}</p>
          )}
        </div>
        {isAdmin && (
          <Link
            href={`/vsos/${vso.id}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Edit
          </Link>
        )}
      </div>

      <Card title="Contact">
        <Row label="Phone" value={vso.directPhone} />
        <Row label="Email" value={vso.directEmail} />
        <Row
          label="Preferred method"
          value={
            vso.preferredContactMethod
              ? (CONTACT_METHOD_LABELS[vso.preferredContactMethod] ?? null)
              : null
          }
        />
        <Row
          label="Location"
          value={
            vso.city || vso.state
              ? [vso.city, vso.state].filter(Boolean).join(", ")
              : null
          }
        />
      </Card>

      <Card title="Partnership">
        <Row
          label="Status"
          value={PARTNERSHIP_STATUS_LABELS[vso.partnershipStatus]}
        />
        <Row label="Referrals made" value={vso.referralsMade.toString()} />
        <Row label="Last updated" value={formatDate(vso.updatedAt)} />
      </Card>

      {vso.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-wrap text-sm md:col-span-2">
            {vso.notes}
          </p>
        </Card>
      )}

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Veterans linked ({veterans.length})
        </h2>
        {veterans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No veterans linked to this VSO yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {veterans.map((v) => (
              <li key={v.id} className="flex items-baseline gap-3">
                <Link
                  href={`/veterans/${v.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {v.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {PIPELINE_LABELS[v.pipelineStage]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
