"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import { RECORD_MAX_BYTES } from "@/lib/schemas";
import { createRecordAction, deleteRecordAction } from "./actions";

export type RecordRow = {
  id: string;
  label: string;
  fileName: string;
  year: number;
  notes: string;
  sizeBytes: number;
  createdAtIso: string;
};

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9.\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const control =
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function RecordsPanel({ records, thisYear }: { records: RecordRow[]; thisYear: number }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const years = [...new Set(records.map((r) => r.year))].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          {adding ? "Cancel" : "Upload a record"}
        </button>
      </div>

      {adding && (
        <UploadForm
          thisYear={thisYear}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      {records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing filed yet. Start with the QuickBooks General Ledger export.
        </p>
      ) : (
        years.map((y) => (
          <section key={y} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">{y}</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {records
                .filter((r) => r.year === y)
                .map((r) => (
                  <RecordItem key={r.id} record={r} />
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function UploadForm({ thisYear, onDone }: { thisYear: number; onDone: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(String(thisYear));
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);

  function onFileChange(f: File | null) {
    setError(null);
    if (f && f.size > RECORD_MAX_BYTES) {
      setFile(null);
      setError("That file is larger than the 25 MB limit.");
      return;
    }
    setFile(f);
    if (f && !label.trim()) setLabel(f.name.replace(/\.[^./\\]+$/, ""));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!file) return setError("Choose a file first.");
    if (!label.trim()) return setError("Give it a name.");
    if (!uid) return setError("Your session is still loading. Try again in a moment.");

    setBusy(true);
    setProgress(0);
    const path = `finance-records/${uid}/${Date.now()}-${crypto.randomUUID()}-${sanitize(file.name)}`;
    try {
      const task = uploadBytesResumable(storageRef(storage, path), file, {
        contentType: file.type || "application/octet-stream",
      });
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });
      const res = await createRecordAction({
        storagePath: path,
        fileName: file.name,
        label: label.trim(),
        year: Number(year),
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (fileInput.current) fileInput.current.value = "";
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-bold">File</label>
        <input
          ref={fileInput}
          type="file"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-sm file:font-bold"
        />
        <p className="text-xs text-muted-foreground">Any file type, up to 25 MB. Kept exactly as uploaded.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold">Name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. QuickBooks General Ledger, final export" className={control} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-bold">Year</label>
          <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className={control} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-bold">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — what it is, where it came from" className={control} />
      </div>
      {progress != null && (
        <div className="h-2 w-full overflow-hidden rounded bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {busy ? `Uploading… ${progress ?? 0}%` : "Upload"}
      </button>
    </form>
  );
}

function RecordItem({ record }: { record: RecordRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(`Delete "${record.label}"? The file is removed for good.`)) return;
    setBusy(true);
    setError(null);
    const res = await deleteRecordAction(record.id);
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <a href={`/api/finances/records/${record.id}`} className="block truncate text-sm font-bold underline-offset-4 hover:underline">
          {record.label}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {[record.fileName, formatSize(record.sizeBytes), `added ${dateFmt.format(new Date(record.createdAtIso))}`, record.notes]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <a href={`/api/finances/records/${record.id}`} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-bold hover:bg-secondary">
        Download
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="inline-flex h-9 items-center rounded-md border border-destructive/40 px-3 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
    </li>
  );
}
