"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reopenIntakeAction } from "../actions";

export function ReopenIntakeButton({
  veteranId,
  intakeId,
}: {
  veteranId: string;
  intakeId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    setError(null);
    const result = await reopenIntakeAction(veteranId, intakeId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/veterans/${veteranId}/intakes/${intakeId}/edit`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {isPending ? "Reopening…" : "Reopen draft"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
