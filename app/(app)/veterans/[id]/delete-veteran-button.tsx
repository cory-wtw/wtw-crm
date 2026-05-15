"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVeteranAction } from "../actions";

export function DeleteVeteranButton({
  veteranId,
  veteranName,
}: {
  veteranId: string;
  veteranName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    setError(null);
    const confirmed = window.confirm(
      `Delete ${veteranName}? This also removes their encounter timeline. Cannot be undone.`,
    );
    if (!confirmed) return;
    const result = await deleteVeteranAction(veteranId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => {
      router.push("/veterans");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/40 bg-card px-3 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
