"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreVeteranAction } from "../actions";

/** Undo a delete. Used on the deleted veteran's page and Admin → Recently deleted. */
export function RestoreVeteranButton({ veteranId }: { veteranId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onRestore() {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const result = await restoreVeteranAction(veteranId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't restore — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onRestore}
        disabled={saving || isPending}
        className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {saving || isPending ? "Restoring…" : "Restore"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
