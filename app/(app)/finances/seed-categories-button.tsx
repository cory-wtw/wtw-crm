"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { seedCategoriesAction } from "./actions";

export function SeedCategoriesButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    setError(null);
    const result = await seedCategoriesAction();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {isPending ? "Loading…" : "Load starter categories"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
