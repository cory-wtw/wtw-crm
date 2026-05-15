import Link from "next/link";
import { listRecentAuditLogs } from "@/lib/db/audit";
import { formatDate } from "@/lib/format";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

const ACTION_TINT: Record<AuditAction, string> = {
  read: "bg-secondary text-muted-foreground",
  create: "bg-primary/20 text-foreground",
  update:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  delete: "bg-destructive/15 text-destructive",
};

function resourceLink(type: ResourceType, id: string): string | null {
  switch (type) {
    case "veteran":
      return `/veterans/${id}`;
    case "vso":
      return `/vsos/${id}`;
    case "phone":
      return `/phones/${id}`;
    case "encounter": {
      // resourceId is "<veteranId>/<encounterId>"; link to the veteran.
      const slash = id.indexOf("/");
      return slash > 0 ? `/veterans/${id.slice(0, slash)}` : null;
    }
    default:
      return null;
  }
}

export default async function AuditLogPage() {
  const logs = await listRecentAuditLogs(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every read of a veteran record + every create / update / delete
          across the system. Showing the most recent {logs.length} entries.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No audit entries yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Changes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => {
                const link = resourceLink(entry.resourceType, entry.resourceId);
                return (
                  <tr
                    key={entry.id}
                    className="border-t border-border align-top"
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatDate(entry.at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-bold">{entry.actorEmail}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {entry.actorUid}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${ACTION_TINT[entry.action]}`}
                      >
                        {AUDIT_ACTION_LABELS[entry.action]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-bold">
                        {RESOURCE_TYPE_LABELS[entry.resourceType]}
                      </p>
                      {link ? (
                        <Link
                          href={link}
                          className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                        >
                          {entry.resourceId}
                        </Link>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          {entry.resourceId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.diff && Object.keys(entry.diff).length > 0 ? (
                        <ul className="space-y-0.5 text-[11px]">
                          {Object.entries(entry.diff).map(([field, change]) => (
                            <li key={field}>
                              <span className="font-bold">{field}:</span>{" "}
                              <span className="text-muted-foreground">
                                {formatValue(change.before)}
                              </span>{" "}
                              →{" "}
                              <span>{formatValue(change.after)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "(empty)";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length === 0 ? "[]" : `[${v.length}]`;
  try {
    return JSON.stringify(v);
  } catch {
    return "(unprintable)";
  }
}
