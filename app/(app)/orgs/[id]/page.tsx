import Link from "next/link";
import { notFound } from "next/navigation";
import { listOrgEncounters } from "@/lib/db/encounters";
import { getOrg } from "@/lib/db/orgs";
import { getUser, listUsers } from "@/lib/db/users";
import { formatDate, formatUsd } from "@/lib/format";
import {
  ORG_CATEGORY_LABELS,
  ORG_RELATIONSHIP_STATUS_LABELS,
  type OrgRelationshipStatus,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/schemas";
import { OrgEncounterForm } from "./org-encounter-form";

export const dynamic = "force-dynamic";

const STATUS_TINT: Record<OrgRelationshipStatus, string> = {
  prospect: "bg-secondary text-foreground",
  engaged:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  active: "bg-primary text-primary-foreground",
  dormant: "bg-muted text-muted-foreground",
  declined: "bg-destructive/15 text-destructive",
};

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [org, encounters, allUsers] = await Promise.all([
    getOrg(id),
    listOrgEncounters(id),
    listUsers(),
  ]);
  if (!org) notFound();
  const assignee = org.assigneeUid ? await getUser(org.assigneeUid) : null;

  const usersByUid = new Map(allUsers.map((u) => [u.uid, u]));
  function nameForUid(uid: string): string {
    if (uid === "system-import") return "AirTable import";
    const u = usersByUid.get(uid);
    return u ? (u.displayName ?? u.email) : "Unknown";
  }

  const totalRaised = encounters.reduce(
    (sum, e) => sum + (e.amount ?? 0),
    0,
  );
  const lastContact = encounters[0]?.occurredAt ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{org.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_TINT[org.relationshipStatus]}`}
            >
              {ORG_RELATIONSHIP_STATUS_LABELS[org.relationshipStatus]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {ORG_CATEGORY_LABELS[org.category]}
          </p>
        </div>
        <Link
          href={`/orgs/${org.id}/edit`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
        >
          Edit
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total raised" value={formatUsd(totalRaised) || "—"} />
        <StatCard label="Encounters" value={encounters.length.toString()} />
        <StatCard
          label="Last contact"
          value={lastContact ? formatDate(lastContact) : "—"}
        />
      </div>

      <Card title="Primary contact">
        <Row label="Name" value={org.primaryContactName} />
        <Row label="Role" value={org.primaryContactRole} />
        <Row label="Email" value={org.primaryContactEmail} />
        <Row label="Phone" value={org.primaryContactPhone} />
      </Card>

      <Card title="Details">
        <Row label="Website" value={org.website} />
        <Row
          label="Location"
          value={
            org.city || org.state
              ? [org.city, org.state].filter(Boolean).join(", ")
              : null
          }
        />
        <Row
          label="Assignee"
          value={
            assignee
              ? (assignee.displayName ?? assignee.email)
              : "Unassigned"
          }
        />
      </Card>

      {org.notes && (
        <Card title="Notes">
          <p className="md:col-span-2 whitespace-pre-wrap text-sm">
            {org.notes}
          </p>
        </Card>
      )}

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Encounters ({encounters.length})
          </h2>
          <OrgEncounterForm orgId={org.id} />
        </div>
        {encounters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No encounters yet. Log the first conversation above.
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
                {e.amount != null && (
                  <p className="mt-2 text-xs">
                    <span className="font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
                      {e.transactionType
                        ? TRANSACTION_TYPE_LABELS[e.transactionType]
                        : "Amount"}
                    </span>{" "}
                    <span className="font-bold">{formatUsd(e.amount)}</span>
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
