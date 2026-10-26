"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { draftResourceAction } from "./quick-add-actions";

/** Where a draft waits between this box and the Add Resource form. */
export const QUICK_ADD_STORAGE_KEY = "wtw:quick-add-draft";

/**
 * Paste a link or some text, get the Add Resource form pre-filled.
 *
 * The draft rides to /resources/new in sessionStorage rather than the URL: it
 * is too long for a query string, and it's only org info, never veteran data.
 */
export function QuickAdd() {
  const router = useRouter();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setError(null);
    setBusy(true);
    try {
      const outcome = await draftResourceAction(paste);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      try {
        sessionStorage.setItem(QUICK_ADD_STORAGE_KEY, JSON.stringify(outcome.result));
      } catch {
        setError("This browser won't hold the draft (private mode?). Add it by hand.");
        return;
      }
      router.push("/resources/new?draft=1");
    } catch {
      setError("Something went wrong drafting that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-bold">Quick add</h2>
        <p className="text-xs text-muted-foreground">
          Paste a website link, a flyer, an email, or your notes. You&rsquo;ll
          get the Add Resource form filled in to check — nothing saves until
          you click Save. Organization info only; no veteran details.
        </p>
      </div>
      <textarea
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        rows={4}
        placeholder="Paste a link or text"
        aria-label="Paste a link or text"
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draft}
          disabled={busy || !paste.trim()}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {busy ? "Drafting… (up to a minute)" : "Draft it"}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
