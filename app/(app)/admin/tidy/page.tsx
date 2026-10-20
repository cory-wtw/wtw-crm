import Link from "next/link";
import { planTidy } from "@/lib/tidy-backfill";
import { ApplyButton } from "./apply-button";

export const dynamic = "force-dynamic";

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

// The admin layout already turns away anyone who isn't an admin.
export default async function TidyDataPage() {
  const rows = await planTidy();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Tidy data
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Puts phone numbers, emails, websites, states, ZIPs and names in one
          format across every veteran and resource. New saves are tidied
          automatically; this catches what was saved before. Instructions like
          &ldquo;Dial 211 and ask for&hellip;&rdquo; are left as written.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm">Everything is already tidy.</p>
      ) : (
        <>
          <ApplyButton count={rows.length} />
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((row) => (
              <li key={`${row.collection}/${row.id}`} className="space-y-1 p-3 text-sm">
                <Link
                  href={`/${row.collection}/${row.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  {row.collection === "veterans" ? "veteran" : "resource"}
                </span>
                {Object.entries(row.changes).map(([field, change]) => (
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
