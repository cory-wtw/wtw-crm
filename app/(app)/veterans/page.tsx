import Link from "next/link";
import {
  countVeteransByStage,
  listVeterans,
  type VeteranListItem,
} from "@/lib/db/veterans";
import { formatUsd } from "@/lib/format";
import {
  lifetimeBenefitsUnlocked,
  monthlyBenefitLift,
  type PipelineStage,
} from "@/lib/schemas";
import { VeteransTable } from "./veterans-table";
import { listChangeRequests } from "@/lib/change-requests-apply";
import { getSession } from "@/lib/firebase/session";
import { isAdmin } from "@/lib/permissions";
import { getUser } from "@/lib/db/users";
import { ChevronRight, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const STAGE_ORDER: PipelineStage[] = [
  "found",
  "connected",
  "filed",
  "won",
  "lost",
];

export default async function VeteransPage() {
  const session = await getSession();
  const admin = isAdmin(session);
  const [veterans, counts, pending, user] = await Promise.all([
    listVeterans(),
    countVeteransByStage(),
    admin ? listChangeRequests("pending", 200) : Promise.resolve([]),
    session ? getUser(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const active = counts.found + counts.connected + counts.filed;
  const needTouch = countNeedingTouch(veterans);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? null;

  const totalMonthlyLift = veterans.reduce(
    (sum, v) =>
      sum + monthlyBenefitLift(v.monthlyBenefitBefore, v.monthlyBenefitAfter),
    0,
  );
  const totalLifetimeLift = veterans.reduce(
    (sum, v) =>
      sum +
      (lifetimeBenefitsUnlocked(
        v.monthlyBenefitBefore,
        v.monthlyBenefitAfter,
        v.birthYear,
      ) ?? 0),
    0,
  );

  const rows: VeteranListItem[] = veterans.map((v) => ({
    id: v.id,
    firstName: v.firstName,
    lastInitial: v.lastInitial ?? "",
    pipelineStage: v.pipelineStage,
    assigneeUid: v.assigneeUid,
    dateFound: v.dateFound?.toISOString() ?? null,
    updatedAt: v.updatedAt.toISOString(),
    monthlyBenefitAfter: v.monthlyBenefitAfter ?? 0,
  }));

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {needTouch === 0
              ? "Everyone's been touched this week. 🙌"
              : `${needTouch} ${needTouch === 1 ? "veteran needs" : "veterans need"} a touch this week.`}
          </p>
        </div>
        <Link
          href="/veterans/new"
          aria-label="Add veteran"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-black text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          <Plus className="h-5 w-5" strokeWidth={2.75} aria-hidden />
          <span className="hidden sm:inline">Add veteran</span>
        </Link>
      </header>

      {admin && (
        <Link
          href="/admin/changes"
          className="group flex items-center justify-between gap-4 rounded-2xl bg-[color:var(--wtw-near-black)] p-5 text-[color:var(--wtw-cream)] shadow-sm"
        >
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[color:var(--wtw-gold-light)] uppercase">
              Admin approvals
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight">
              {pending.length} waiting
            </p>
          </div>
          <span className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-[color:var(--wtw-gold-light)] px-4 text-sm font-black text-[color:var(--wtw-near-black)] transition-transform group-hover:translate-x-0.5">
            Review
            <ChevronRight className="h-4 w-4" strokeWidth={3} aria-hidden />
          </span>
        </Link>
      )}

      <section aria-label="Impact" className="grid grid-cols-2 gap-3">
        <Stat
          label="Benefits unlocked"
          value={formatUsd(totalMonthlyLift)}
          unit="/mo"
          note={totalLifetimeLift > 0 ? `${formatUsd(totalLifetimeLift)} est. lifetime` : undefined}
        />
        <Stat
          label="Active veterans"
          value={String(active)}
          note={`${counts.won} won · ${counts.found + counts.connected + counts.filed + counts.won + counts.lost} total`}
        />
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-bold">No veterans yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add veterans as outreach identifies them.
          </p>
          <Link
            href="/veterans/new"
            className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-black text-primary-foreground"
          >
            Add the first veteran
          </Link>
        </div>
      ) : (
        <VeteransTable rows={rows} counts={counts} stageOrder={STAGE_ORDER} />
      )}
    </div>
  );
}

/** Active veterans nobody has updated in the last week. */
function countNeedingTouch(veterans: { pipelineStage: PipelineStage; updatedAt: Date }[]): number {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return veterans.filter(
    (v) =>
      (v.pipelineStage === "found" || v.pipelineStage === "connected" || v.pipelineStage === "filed") &&
      v.updatedAt.getTime() < weekAgo,
  ).length;
}

/** Time-of-day greeting in Eastern time, where the team works. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(29_25_18/0.04)]">
      <p className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 truncate text-[26px] leading-none font-black tracking-tight sm:text-3xl">
        {value}
        {unit && <span className="ml-0.5 text-sm font-bold text-muted-foreground">{unit}</span>}
      </p>
      {note && <p className="mt-2 truncate text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
