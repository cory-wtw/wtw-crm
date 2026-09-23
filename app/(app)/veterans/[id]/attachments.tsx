"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import { convertToPdf, isConvertibleFile } from "@/lib/pdf-convert";
import { ATTACHMENT_MAX_BYTES } from "@/lib/schemas";
import {
  createAttachmentAction,
  deleteAttachmentAction,
  renameAttachmentAction,
} from "./actions";

export type AttachmentRow = {
  id: string;
  name: string;
  downloadUrl: string;
  sizeBytes: number;
  createdAtIso: string;
};

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9.\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

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

export function Attachments({
  veteranId,
  items,
  canManage,
}: {
  veteranId: string;
  items: AttachmentRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Files ({items.length})
        </h2>
        <div className="flex items-center gap-2">
          {items.length > 1 && (
            <a
              href={`/api/veterans/${veteranId}/attachments/packet`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
            >
              Download all
            </a>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => setUploading((v) => !v)}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
            >
              {uploading ? "Cancel" : "Add file"}
            </button>
          )}
        </div>
      </div>

      {uploading && (
        <UploadForm
          veteranId={veteranId}
          onDone={() => {
            setUploading(false);
            router.refresh();
          }}
        />
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files uploaded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <AttachmentItem
              key={item.id}
              veteranId={veteranId}
              item={item}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadForm({
  veteranId,
  onDone,
}: {
  veteranId: string;
  onDone: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  function onFileChange(f: File | null) {
    setError(null);
    if (f && !isConvertibleFile(f)) {
      setFile(null);
      setError("Only images and PDFs are supported.");
      return;
    }
    setFile(f);
    if (f && !name.trim()) {
      setName(f.name.replace(/\.[^./\\]+$/, ""));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (!name.trim()) {
      setError("Give the file a name.");
      return;
    }
    if (!uid) {
      setError("Your session is still loading — try again in a moment.");
      return;
    }

    setBusy(true);
    setConverting(true);

    try {
      const pdfBytes = await convertToPdf(file);
      setConverting(false);

      if (pdfBytes.byteLength > ATTACHMENT_MAX_BYTES) {
        setError("That file is larger than the 25 MB limit, even after conversion.");
        setBusy(false);
        return;
      }

      setProgress(0);

      const path = `attachments/${veteranId}/${Date.now()}-${crypto.randomUUID()}-${sanitize(
        name.trim(),
      )}.pdf`;

      const pdfArrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer;
      const task = uploadBytesResumable(
        storageRef(storage, path),
        new Blob([pdfArrayBuffer], { type: "application/pdf" }),
        { contentType: "application/pdf" },
      );

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) =>
            setProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            ),
          reject,
          () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
        );
      });

      const res = await createAttachmentAction(veteranId, {
        veteranId,
        storagePath: path,
        downloadUrl,
        contentType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        fileName: `${sanitize(name.trim())}.pdf`,
        name: name.trim(),
      });

      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        setProgress(null);
        return;
      }

      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      setBusy(false);
      setProgress(null);
      onDone();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
      setConverting(false);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 space-y-3 rounded-lg border border-border bg-background p-4"
    >
      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          File
        </label>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-bold"
        />
        <p className="text-[11px] text-muted-foreground">
          Images and PDFs only, up to 25 MB. Images are saved as PDFs.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. DD-214, VA award letter"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      {converting && (
        <p className="text-[11px] text-muted-foreground">Converting…</p>
      )}

      {progress != null && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Uploading… {progress}%
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {converting ? "Converting…" : busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

function AttachmentItem({
  veteranId,
  item,
  canManage,
}: {
  veteranId: string;
  item: AttachmentRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await renameAttachmentAction(veteranId, item.id, {
      name: name.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    const confirmed = window.confirm(`Delete "${item.name}"? Cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    const res = await deleteAttachmentAction(veteranId, item.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <form onSubmit={onRename} className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(item.name);
                setError(null);
              }}
              className="text-xs font-bold text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </form>
        ) : (
          <a
            href={item.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold underline-offset-4 hover:underline"
          >
            {item.name}
          </a>
        )}

        {!editing && (
          <div className="flex items-center gap-3">
            <a
              href={`/api/veterans/${veteranId}/attachments/${item.id}`}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Download
            </a>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="text-xs font-bold text-destructive hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatSize(item.sizeBytes)} · {dateFmt.format(new Date(item.createdAtIso))}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
