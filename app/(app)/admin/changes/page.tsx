import Link from "next/link";
import { listChangeRequests } from "@/lib/change-requests-apply";
import { formatDate } from "@/lib/format";
import {
  CHANGE_REQUEST_EXPIRY_DAYS,
  CHANGE_REQUEST_KIND_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  isExpired,
  type ChangeRequest,
} from "@/lib/schemas";
import { DecideButtons } from "./decide-buttons";

export const dynamic = "force-dynamic";

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDate(new Date(value));
  }
  return String(value);
}

function targetHref(cr: ChangeRequest): string | null {
  const id = cr.targetId ?? cr.appliedId;
  if (!id) return null;
  if (cr.kind.startsWith("vso.")) return `/vsos/${id}`;
  return `/veterans/${cr.kind === "encounter.create" ? cr.targetId : id}`;
}

function Changes({ cr }: { cr: ChangeRequest }) {
  const isCreate = cr.kind.endsWith(".create");
  return (
    <ul className="space-y-1">
      {Object.entries(cr.changes).map(([field, change]) => (
        <li key={field} className="text-sm">
          <span className="text-muted-foreground">{field}: </span>
          {!isCreate && (
            <>
              <span className="line-through opacity-60">{show(change.before)}</span>
              {" → "}
            </>
          )}
          <span className="font-bold">{show(change.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function Header({ cr }: { cr: ChangeRequest }) {
  const href = targetHref(cr);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        {CHANGE_REQUEST_KIND_LABELS[cr.kind]}
      </span>
      {href ? (
        <Link href={href} className="font-bold underline-offset-4 hover:underline">
          {cr.targetLabel}
        </Link>
      ) : (
        <span className="font-bold">{cr.targetLabel}</span>
      )}
      <span className="text-xs text-muted-foreground">{formatDate(cr.proposedAt)}</span>
    </div>
  );
}

// The admin layout already turns away anyone who isn't an admin.
export default async function ClaudeChangesPage() {
  const [pending, recent] = await Promise.all([
    listChangeRequests("pending", 100),
    listChangeRequests(undefined, 60),
  ]);
  const decided = recent.filter((cr) => cr.status !== "pending").slice(0, 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Claude changes</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Edits Claude has asked to make through the Roster connector. Nothing
          below has touched a record yet. Approving saves exactly the values
          shown — if anyone has edited the record since Claude looked, it&rsquo;s
          marked out of date instead and nothing is saved. Requests older
          than {CHANGE_REQUEST_EXPIRY_DAYS} days can&rsquo;t be approved.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-black">Waiting for you ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm">Nothing waiting.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((cr) => (
              <li key={cr.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <Header cr={cr} />
                <p className="text-sm text-[color:var(--wtw-deep-gold)]">{cr.reason}</p>
                <Changes cr={cr} />
                {isExpired(cr.proposedAt) ? (
                  <p className="text-sm text-destructive">
                    Expired — approving will mark it out of date.
                  </p>
                ) : null}
                <DecideButtons id={cr.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-black">Recently decided</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {decided.map((cr) => (
              <li key={cr.id} className="space-y-1 p-3">
                <Header cr={cr} />
                <p className="text-xs">
                  <span className="font-bold">{CHANGE_REQUEST_STATUS_LABELS[cr.status]}</span>
                  {cr.reviewedByEmail && cr.status !== "withdrawn" ? ` by ${cr.reviewedByEmail}` : ""}
                  {cr.reviewNote ? ` — ${cr.reviewNote}` : ""}
                </p>
                <Changes cr={cr} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
