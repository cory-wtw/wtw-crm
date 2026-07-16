"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type MediaKind } from "@/lib/schemas";
import { editMediaAction } from "../../actions";

type VeteranOption = { id: string; name: string };

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function EditMediaForm({
  id,
  fileName,
  kind,
  downloadUrl,
  initialCaption,
  initialTags,
  initialConsent,
  initialVeteranId,
  veterans,
  showVeteranPicker,
}: {
  id: string;
  fileName: string;
  kind: MediaKind;
  downloadUrl: string;
  initialCaption: string;
  initialTags: string[];
  initialConsent: boolean;
  initialVeteranId: string | null;
  veterans: VeteranOption[];
  showVeteranPicker: boolean;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(initialCaption);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [linkedVeteranId, setLinkedVeteranId] = useState(
    initialVeteranId ?? "",
  );
  const [consentOnFile, setConsentOnFile] = useState(initialConsent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!caption.trim()) {
      setError("Add a short description.");
      return;
    }
    startTransition(async () => {
      const res = await editMediaAction(id, {
        caption: caption.trim(),
        tags: parseTags(tags),
        linkedVeteranId: linkedVeteranId || null,
        consentOnFile,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/social");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="aspect-video bg-secondary">
          {kind === "video" ? (
            <video
              src={downloadUrl}
              controls
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={downloadUrl}
              alt={caption}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <p className="truncate px-3 py-2 text-[11px] text-muted-foreground">
          {fileName}
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

      {showVeteranPicker && (
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
      )}

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
            Check only if everyone shown has signed a release.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
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
