"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyZipBackfillAction } from "./actions";

export function ApplyButton({ count }: { count: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function apply() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await applyZipBackfillAction();
      setMessage(
        response.ok
          ? `Saved ${response.written} ${response.written === 1 ? "ZIP" : "ZIPs"}.`
          : response.error,
      );
      if (response.ok) router.refresh();
    } catch (error) {
      // No console on a phone — the screen has to say what went wrong.
      setMessage(
        `Didn't save: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={apply}
        disabled={saving}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : `Save ${count} ${count === 1 ? "ZIP" : "ZIPs"}`}
      </button>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
