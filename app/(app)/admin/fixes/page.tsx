import Link from "next/link";
import { planFixes } from "@/lib/record-fixes-apply";
import { ApplyButton } from "./apply-button";

export const dynamic = "force-dynamic";

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return Array.isArray(value) ? value.join(", ") || "—" : String(value);
}

// The admin layout already turns away anyone who isn't an admin.
export default async function RecordFixesPage() {
  const fixes = await planFixes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Record fixes
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Changes that would otherwise be done one record at a time: who a
          program only serves (MST, SSVF, HUD-VASH), retiring lender and
          realtor listings and duplicate records, corrections from research
          (who Bridge Health and Vet Centers serve, Chattanooga places open to
          anyone nearby), and rewriting he/him in record text. Each
          record&rsquo;s change is listed below with why. Nothing is written
          until you tap the button.
        </p>
      </div>

      {fixes.length === 0 ? (
        <p className="text-sm">Nothing to fix.</p>
      ) : (
        <>
          <ApplyButton count={fixes.length} />
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {fixes.map((f) => (
              <li key={f.id} className="space-y-1 p-3 text-sm">
                <Link
                  href={`/resources/${f.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {f.name}
                </Link>
                {f.reasons.map((reason) => (
                  <p key={reason} className="text-xs text-[color:var(--wtw-deep-gold)]">
                    {reason}
                  </p>
                ))}
                {Object.entries(f.changes).map(([field, change]) => (
                  <p key={field} className="text-xs">
                    <span className="text-muted-foreground">{field}: </span>
                    <span className="line-through opacity-60">{show(change.before)}</span>
                    {" → "}
                    <span className="font-bold">{show(change.after)}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
