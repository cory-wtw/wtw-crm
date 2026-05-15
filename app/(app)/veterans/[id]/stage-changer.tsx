"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeStageAction } from "../actions";
import {
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/schemas";

export function StageChanger({
  veteranId,
  currentStage,
}: {
  veteranId: string;
  currentStage: PipelineStage;
}) {
  const router = useRouter();
  const [nextStage, setNextStage] = useState<PipelineStage>(currentStage);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = await changeStageAction(veteranId, nextStage);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  const disabled = isPending || nextStage === currentStage;

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="stage-select">
          Next stage
        </label>
        <select
          id="stage-select"
          value={nextStage}
          onChange={(e) => setNextStage(e.target.value as PipelineStage)}
          disabled={isPending}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_LABELS[s]}
              {s === currentStage ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isPending ? "Updating…" : "Change stage"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
