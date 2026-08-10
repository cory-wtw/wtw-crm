import { loadCurrentRateAmounts } from "@/lib/db/rates";
import { listVeterans } from "@/lib/db/veterans";
import { formatUsd } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { monthlyForRating, monthlyLift } from "@/lib/rate-lookup";
import { DEPENDENT_STATUS_LABELS } from "@/lib/schemas";
import { ReportCsvButton, type ReportRow } from "./report-csv-button";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [veterans, { year, amounts }] = await Promise.all([
    listVeterans(),
    loadCurrentRateAmounts(),
  ]);

  const rows: ReportRow[] = veterans
    .map((v) => {
      const before = monthlyForRating(
        v.ratingBefore,
        v.dependentStatus,
        amounts,
      );
      const after = monthlyForRating(
        v.ratingAfter,
        v.dependentStatus,
        amounts,
      );
      return {
        name: formatShortName(v.firstName, v.lastInitial),
        dependents: DEPENDENT_STATUS_LABELS[v.dependentStatus],
        ratingBefore: v.ratingBefore,
        ratingAfter: v.ratingAfter,
        before,
        after,
        lift: monthlyLift(before, after),
      };
    })
    .sort((a, b) => b.lift - a.lift);

  const totalMonthly = rows.reduce((sum, r) => sum + r.lift, 0);
  const totalAnnual = totalMonthly * 12;
  const helped = rows.filter((r) => r.lift > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Income unlocked
          </h1>
          <p className="text-sm text-muted-foreground">
            Monthly VA benefit gained since WTW got involved, in{" "}
            {year ? `${year}` : "current"} VA dollars.
          </p>
        </div>
        <ReportCsvButton rows={rows} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Veterans with a gain" value={helped.toString()} />
        <Stat label="Monthly unlocked" value={formatUsd(totalMonthly)} />
        <Stat label="Annual unlocked" value={formatUsd(totalAnnual)} />
      </div>

      {!year && (
        <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          The VA rate table hasn&rsquo;t been seeded, so dollar amounts show as
          $0. Run <code>npm run seed-rates</code> to load it.
        </p>
      )}

      <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-secondary/60">
            <tr>
              <Th>Name</Th>
              <Th>Dependents</Th>
              <Th className="text-right">Before</Th>
              <Th className="text-right">After</Th>
              <Th className="text-right">Monthly unlocked</Th>
              <Th className="text-right">Annual unlocked</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-2.5 font-bold">{r.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {r.dependents}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.ratingBefore}% · {formatUsd(r.before)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.ratingAfter}% · {formatUsd(r.after)}
                </td>
                <td className="px-4 py-2.5 text-right font-bold">
                  {r.lift ? formatUsd(r.lift) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.lift ? formatUsd(r.lift * 12) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="border-t border-border p-6 text-center text-xs text-muted-foreground">
            No veterans yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)] ${className}`}
    >
      {children}
    </th>
  );
}
