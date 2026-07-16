import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getPhone } from "@/lib/db/phones";
import { listVeteransByPhoneId } from "@/lib/db/veterans";
import { formatDate } from "@/lib/format";
import {
  PHONE_STATUS_LABELS,
  type PhoneStatus,
  PIPELINE_LABELS,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

const STATUS_TINT: Record<PhoneStatus, string> = {
  available:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  assigned: "bg-primary text-primary-foreground",
  returned: "bg-secondary text-foreground",
  lost: "bg-destructive/15 text-destructive",
  retired: "bg-muted text-muted-foreground",
};

export default async function PhoneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [phone, session, holders] = await Promise.all([
    getPhone(id),
    getSession(),
    listVeteransByPhoneId(id),
  ]);
  if (!phone) notFound();
  const canEdit = !!session;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {phone.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_TINT[phone.status]}`}
            >
              {PHONE_STATUS_LABELS[phone.status]}
            </span>
          </div>
          {phone.imeiSerial && (
            <p className="text-sm text-muted-foreground">
              IMEI / Serial: {phone.imeiSerial}
            </p>
          )}
        </div>
        {canEdit && (
          <Link
            href={`/phones/${phone.id}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Edit
          </Link>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Currently with
        </h2>
        {holders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not assigned to anyone right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {holders.map((v) => (
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
        {holders.length > 1 && (
          <p className="mt-3 text-xs text-destructive">
            Warning: more than one veteran has this phone assigned. Check the
            veteran pages and clean up.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Metadata
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Row label="Last updated" value={formatDate(phone.updatedAt)} />
          <Row label="Added" value={formatDate(phone.createdAt)} />
        </div>
      </section>

      {phone.notes && (
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Notes
          </h2>
          <p className="whitespace-pre-wrap text-sm">{phone.notes}</p>
        </section>
      )}
    </div>
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
