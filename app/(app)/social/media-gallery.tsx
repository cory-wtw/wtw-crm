"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { type MediaKind, type MediaStatus } from "@/lib/schemas";
import { deleteMediaAction, setMediaUsedAction } from "./actions";

export type MediaRow = {
  id: string;
  kind: MediaKind;
  downloadUrl: string;
  fileName: string;
  caption: string;
  tags: string[];
  status: MediaStatus;
  consentOnFile: boolean;
  sizeBytes: number;
  createdBy: string;
  createdAtIso: string;
  usedAtIso: string | null;
  linkedVeteranId: string | null;
  linkedVeteranName: string | null;
};

type Filter = "all" | MediaStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "used", label: "Used" },
  { key: "archived", label: "Archived" },
];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function MediaGallery({
  rows,
  currentUid,
  isAdmin,
}: {
  rows: MediaRow[];
  currentUid: string;
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [consentOnly, setConsentOnly] = useState(false);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (consentOnly && !r.consentOnFile) return false;
      return true;
    });
  }, [rows, filter, consentOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground">
          <input
            type="checkbox"
            checked={consentOnly}
            onChange={(e) => setConsentOnly(e.target.checked)}
          />
          Consent on file only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing matches this filter.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => (
            <MediaCard
              key={row.id}
              row={row}
              canManage={isAdmin || row.createdBy === currentUid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({
  row,
  canManage,
}: {
  row: MediaRow;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isUsed = row.status === "used";

  function toggleUsed() {
    setError(null);
    startTransition(async () => {
      const res = await setMediaUsedAction(row.id, !isUsed);
      if (!res.ok) setError(res.error);
    });
  }

  function remove() {
    if (!confirm(`Delete "${row.caption}"? This removes the file too.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMediaAction(row.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <figure
      className={`flex flex-col overflow-hidden rounded-lg border-2 bg-card transition-colors ${
        isUsed ? "border-[color:var(--wtw-deep-gold)]" : "border-border"
      }`}
    >
      <div className="relative aspect-video bg-secondary">
        {row.kind === "video" ? (
          <video
            src={row.downloadUrl}
            controls
            preload="metadata"
            className={`h-full w-full object-cover ${
              isUsed ? "opacity-60 grayscale" : ""
            }`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.downloadUrl}
            alt={row.caption}
            className={`h-full w-full object-cover ${
              isUsed ? "opacity-60 grayscale" : ""
            }`}
          />
        )}

        {isUsed ? (
          <>
            {/* Bold, unmistakable "used" marker across the thumbnail. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-8deg] rounded-md border-2 border-[color:var(--wtw-deep-gold)] bg-[color:var(--wtw-near-black)]/75 px-4 py-1 text-lg font-black uppercase tracking-widest text-[color:var(--wtw-gold-light)] shadow-lg">
                ✓ Used
              </span>
            </div>
            <span className="absolute left-2 top-2 rounded bg-[color:var(--wtw-deep-gold)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              Used
            </span>
          </>
        ) : (
          <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
            New
          </span>
        )}
      </div>

      <figcaption className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm font-bold leading-snug">{row.caption}</p>

        <div className="flex flex-wrap gap-1 text-[11px]">
          <span
            className={`rounded px-1.5 py-0.5 font-bold ${
              row.consentOnFile
                ? "bg-primary/15 text-[color:var(--wtw-deep-gold)]"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {row.consentOnFile ? "Consent on file" : "No consent"}
          </span>
          {row.linkedVeteranName && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">
              {row.linkedVeteranName}
            </span>
          )}
          {row.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground"
            >
              #{t}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {formatSize(row.sizeBytes)} ·{" "}
          {dateFmt.format(new Date(row.createdAtIso))}
          {isUsed && row.usedAtIso && (
            <span className="font-bold text-[color:var(--wtw-deep-gold)]">
              {" "}
              · Used {dateFmt.format(new Date(row.usedAtIso))}
            </span>
          )}
        </p>

        {error && <p className="text-[11px] text-destructive">{error}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <a
            href={row.downloadUrl}
            download={row.fileName}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-bold transition-colors hover:bg-secondary"
          >
            Download
          </a>
          <button
            type="button"
            onClick={toggleUsed}
            disabled={isPending}
            className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-bold transition-colors disabled:opacity-50 ${
              isUsed
                ? "border border-border hover:bg-secondary"
                : "bg-[color:var(--wtw-deep-gold)] text-white hover:opacity-90"
            }`}
          >
            {isUsed ? "Mark unused" : "Mark used"}
          </button>
          {canManage && (
            <div className="ml-auto flex items-center gap-1">
              <Link
                href={`/social/${row.id}/edit`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-bold transition-colors hover:bg-secondary"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
