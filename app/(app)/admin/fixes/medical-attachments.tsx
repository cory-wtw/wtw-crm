"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteAttachmentAction } from "../../veterans/[id]/actions";

export type MedicalAttachmentRow = {
  id: string;
  veteranId: string;
  veteranName: string;
  fileName: string;
  name: string;
  matchedTerms: string[];
  createdAtIso: string;
  /** Who ticked "not a medical record", when someone did. */
  confirmedBy: string | null;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function MedicalAttachments({ rows }: { rows: MedicalAttachmentRow[] }) {
  const [showConfirmed, setShowConfirmed] = useState(false);
  const confirmedCount = rows.filter((r) => r.confirmedBy).length;
  const visible = showConfirmed ? rows : rows.filter((r) => !r.confirmedBy);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-black tracking-tight">
          Possible medical attachments
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Files whose name mentions a condition, treatment, or claim. The Roster
          never stores medical records. Open each one, and delete it if it is
          one &mdash; the veteran or their VSO keeps the original.
        </p>
      </div>
      {confirmedCount > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showConfirmed}
            onChange={(e) => setShowConfirmed(e.target.checked)}
          />
          <span>
            Show confirmed ({confirmedCount} already marked not medical)
          </span>
        </label>
      )}
      {visible.length === 0 ? (
        <p className="text-sm">No file names look medical.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {visible.map((row) => (
            <MedicalAttachmentItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MedicalAttachmentItem({ row }: { row: MedicalAttachmentRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete "${row.name}" from ${row.veteranName}'s record? Cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteAttachmentAction(
        row.veteranId,
        row.id,
        "medical-cleanup",
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      // No console on a phone — the screen has to say what went wrong.
      setError(
        `Didn't delete: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-1 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/veterans/${row.veteranId}`}
            className="font-bold underline-offset-4 hover:underline"
          >
            {row.veteranName}
          </Link>
          <span className="text-muted-foreground"> · </span>
          <a
            href={`/api/veterans/${row.veteranId}/attachments/${row.id}`}
            className="underline-offset-4 hover:underline"
          >
            {row.name}
          </a>
          {row.fileName && row.fileName !== row.name && (
            <span className="break-all text-xs text-muted-foreground">
              {" "}
              ({row.fileName})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-xs font-bold text-destructive hover:underline disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
      <p className="text-xs text-[color:var(--wtw-deep-gold)]">
        Mentions {row.matchedTerms.join(", ")}
      </p>
      <p className="text-xs text-muted-foreground">
        Uploaded {dateFmt.format(new Date(row.createdAtIso))}
        {row.confirmedBy && ` · Confirmed not medical by ${row.confirmedBy}`}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
