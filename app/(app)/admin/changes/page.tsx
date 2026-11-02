import Link from "next/link";
import { inApplyOrder, listChangeRequests } from "@/lib/change-requests-apply";
import { listGrants } from "@/lib/mcp/oauth";
import { formatDate } from "@/lib/format";
import {
  CHANGE_REQUEST_EXPIRY_DAYS,
  CHANGE_REQUEST_KIND_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  isExpired,
  type ChangeRequest,
} from "@/lib/schemas";
import { ActionButton, CopyText } from "./action-button";
import { approveGroupAction, revokeGrantAction } from "./actions";
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
  if (cr.kind.startsWith("transaction.")) return "/finances/transactions";
  const id = cr.kind.endsWith(".create") && cr.kind !== "encounter.create" ? cr.appliedId : cr.targetId;
  if (!id || id.startsWith("pending:")) return null;
  if (cr.kind.startsWith("vso.")) return `/vsos/${id}`;
  if (cr.kind.startsWith("resource.")) return `/resources/${id}`;
  return `/veterans/${id}`;
}

/** Pending requests in their calls, oldest call first; ungrouped ones alone. */
function byCall(pending: ChangeRequest[]): { label: string | null; items: ChangeRequest[] }[] {
  const groups = new Map<string, ChangeRequest[]>();
  const loose: { label: null; items: ChangeRequest[] }[] = [];
  for (const cr of inApplyOrder(pending)) {
    if (!cr.groupLabel) loose.push({ label: null, items: [cr] });
    else groups.set(cr.groupLabel, [...(groups.get(cr.groupLabel) ?? []), cr]);
  }
  return [...[...groups].map(([label, items]) => ({ label, items })), ...loose];
}

function PendingCard({ cr }: { cr: ChangeRequest }) {
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(29_25_18/0.04)]">
      <Header cr={cr} />
      <p className="rounded-xl bg-secondary/70 px-3 py-2 text-sm">{cr.reason}</p>
      <Changes cr={cr} />
      {cr.lastError && <p className="text-sm text-destructive">Last try: {cr.lastError}</p>}
      {isExpired(cr.proposedAt) ? (
        <p className="text-sm text-destructive">Expired — approving will mark it out of date.</p>
      ) : null}
      <DecideButtons id={cr.id} />
    </li>
  );
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
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
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
  const [pending, recent, grants] = await Promise.all([
    listChangeRequests("pending", 200),
    listChangeRequests(undefined, 80),
    listGrants(),
  ]);
  const decided = recent.filter((cr) => cr.status !== "pending").slice(0, 30);
  const calls = byCall(pending);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">Approvals</h1>
        <p className="text-[15px] text-muted-foreground">
          {pending.length === 0
            ? "You're all caught up."
            : `${pending.length} ${pending.length === 1 ? "change is" : "changes are"} waiting. Nothing is saved until you approve.`}
        </p>
        <details className="max-w-2xl text-sm text-muted-foreground">
          <summary className="cursor-pointer font-bold text-foreground">How this works</summary>
          <p className="mt-2">
          Changes Claude has asked to make through the Roster connector —
          records, intakes, referrals, follow-ups, wins, resources and the
          books. Nothing below has touched a record yet. Approving saves exactly the values
          shown — if anyone has edited the record since Claude looked, it&rsquo;s
          marked out of date instead and nothing is saved. Requests older
          than {CHANGE_REQUEST_EXPIRY_DAYS} days can&rsquo;t be approved.
          </p>
        </details>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Waiting for you · {pending.length}</h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Nothing waiting. 🙌</p>
        ) : (
          <div className="space-y-6">
            {calls.map(({ label, items }) =>
              label ? (
                <div key={label} className="space-y-3 rounded-3xl bg-secondary/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                    <h3 className="text-base font-black">{label} <span className="text-muted-foreground">· {items.length}</span></h3>
                    {items.length > 1 && (
                      <ActionButton
                        primary
                        label={`Approve all ${items.length}`}
                        confirm={`Approve all ${items.length} changes from "${label}", in order?`}
                        run={approveGroupAction.bind(null, label, items.map((cr) => cr.id))}
                      />
                    )}
                  </div>
                  <ul className="space-y-3">
                    {items.map((cr) => (
                      <PendingCard key={cr.id} cr={cr} />
                    ))}
                  </ul>
                </div>
              ) : (
                <ul key={items[0].id} className="space-y-3">
                  <PendingCard cr={items[0]} />
                </ul>
              ),
            )}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Recently decided</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {decided.map((cr) => (
              <li key={cr.id} className="space-y-1 p-4">
                <Header cr={cr} />
                <p className="text-xs">
                  <span className="font-bold">{CHANGE_REQUEST_STATUS_LABELS[cr.status]}</span>
                  {cr.reviewedByEmail && cr.status !== "withdrawn" ? ` by ${cr.reviewedByEmail}` : ""}
                  {cr.reviewNote ? ` — ${cr.reviewNote}` : ""}
                </p>
                <Changes cr={cr} />
                {typeof cr.result?.referralText === "string" && (
                  <div className="space-y-1 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Nothing was sent. Read it once more, then send it yourself — or ask Claude to draft the email.
                    </p>
                    <CopyText text={cr.result.referralText} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Connected Claude · {grants.length}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each one is a Claude app an admin signed in to the Roster. It can read
          records and propose changes, never approve them. Disconnect one and its
          next call is refused; deactivating the admin cuts off theirs too.
        </p>
        {grants.length === 0 ? (
          <p className="text-sm">None connected.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div>
                  <p className="font-bold">{g.clientName} · {g.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Connected {formatDate(g.createdAt)}
                    {g.lastUsedAt ? ` · last used ${formatDate(g.lastUsedAt)}` : ""}
                  </p>
                </div>
                <ActionButton
                  label="Disconnect"
                  confirm="Disconnect this Claude? It will have to sign in again."
                  run={revokeGrantAction.bind(null, g.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
