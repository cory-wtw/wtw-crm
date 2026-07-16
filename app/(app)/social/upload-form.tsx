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
import { MEDIA_MAX_BYTES, mediaKindFromContentType } from "@/lib/schemas";
import { createMediaAction } from "./actions";

type VeteranOption = { id: string; name: string };

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9.\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function UploadForm({ veterans }: { veterans: VeteranOption[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [linkedVeteranId, setLinkedVeteranId] = useState("");
  const [consentOnFile, setConsentOnFile] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Choose a photo or video first.");
      return;
    }
    const kind = mediaKindFromContentType(file.type);
    if (!kind) {
      setError("Only photos and videos are allowed.");
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setError(
        "That file is larger than the 500 MB limit. Trim it, or paste a link in the caption instead.",
      );
      return;
    }
    if (!caption.trim()) {
      setError("Add a short description.");
      return;
    }
    if (!uid) {
      setError("Your session is still loading — try again in a moment.");
      return;
    }

    setBusy(true);
    setProgress(0);

    const path = `media/${uid}/${Date.now()}-${crypto.randomUUID()}-${sanitize(
      file.name,
    )}`;

    try {
      const task = uploadBytesResumable(storageRef(storage, path), file, {
        contentType: file.type,
      });

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

      const res = await createMediaAction({
        kind,
        storagePath: path,
        downloadUrl,
        contentType: file.type,
        sizeBytes: file.size,
        fileName: file.name,
        caption: caption.trim(),
        tags: parseTags(tags),
        linkedVeteranId: linkedVeteranId || null,
        consentOnFile,
      });

      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        setProgress(null);
        return;
      }

      router.push("/social");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          Photo or video
        </label>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-bold"
        />
        <p className="text-[11px] text-muted-foreground">
          Up to 500 MB. That&rsquo;s roughly 90 seconds of default iPhone
          video, or a few minutes at lower quality.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          Description
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder="What's happening in this photo/video?"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          Tags <span className="text-muted-foreground">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="event, ribbon-cutting, 2026"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
          Related veteran{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <select
          value={linkedVeteranId}
          onChange={(e) => setLinkedVeteranId(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {veterans.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <input
          type="checkbox"
          checked={consentOnFile}
          onChange={(e) => setConsentOnFile(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-bold">Photo/media release on file.</span>{" "}
          <span className="text-muted-foreground">
            Check only if everyone shown has signed a release. The social media
            manager can filter to consented media before posting.
          </span>
        </span>
      </label>

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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/social")}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-bold transition-colors hover:bg-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
