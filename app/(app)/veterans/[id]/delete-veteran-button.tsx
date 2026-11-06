"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVeteranAction } from "../actions";

/**
 * Sits at the very bottom of the veteran page, away from Edit, so it can't be
 * hit by mistake. Opening it asks for the veteran's first name before the
 * Delete button turns on.
 */
export function DeleteVeteranButton({
  veteranId,
  firstName,
}: {
  veteranId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const matches =
    typed.trim().toLowerCase() === firstName.trim().toLowerCase() &&
    typed.trim() !== "";

  async function onDelete() {
    if (!matches || saving) return;
    setError(null);
    setSaving(true);
    try {
      const result = await deleteVeteranAction(veteranId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      startTransition(() => {
        router.push("/veterans");
        router.refresh();
      });
    } catch {
      setError("Couldn't delete — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center text-xs font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Delete veteran
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-destructive/40 bg-card p-5">
      <h2 className="text-sm font-bold text-destructive">Delete veteran</h2>
      <p className="text-sm text-muted-foreground">
        This hides {firstName} from every list. An admin can restore them from
        Admin → Recently deleted.
      </p>
      <label className="block space-y-1.5">
        <span className="block text-sm font-bold">
          Type <span className="font-mono">{firstName}</span> to confirm
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDelete}
          disabled={!matches || saving || isPending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-destructive/40 bg-card px-3 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {saving || isPending ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
