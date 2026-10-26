"use client";

import { useEffect, useState } from "react";
import type { QuickAddResult } from "@/lib/quick-add-runner";
import { QUICK_ADD_STORAGE_KEY } from "../quick-add";
import { ResourceForm } from "../resource-form";

/**
 * The Add Resource form, pre-filled from a Quick add draft when there is one.
 *
 * The draft is read once and then removed, so a reload or a second visit is a
 * blank form rather than a stale draft somebody already dealt with.
 */
export function DraftReview({ fromDraft }: { fromDraft: boolean }) {
  const [draft, setDraft] = useState<QuickAddResult | null | undefined>(
    fromDraft ? undefined : null,
  );

  useEffect(() => {
    if (!fromDraft) return;
    let stored: QuickAddResult | null = null;
    try {
      const raw = sessionStorage.getItem(QUICK_ADD_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as QuickAddResult;
      sessionStorage.removeItem(QUICK_ADD_STORAGE_KEY);
    } catch {
      stored = null;
    }
    // Storage only exists in the browser, so this has to run after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(stored);
  }, [fromDraft]);

  if (draft === undefined) {
    return <p className="text-sm text-muted-foreground">Loading the draft…</p>;
  }
  if (!draft) return <ResourceForm />;

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-brand-gold)]/10 p-4 text-sm">
        <p className="font-bold">
          Drafted — check every highlighted field before saving.
        </p>
        <p className="text-xs text-muted-foreground">
          The highlight clears when you edit a field or click &ldquo;Looks
          right&rdquo;. Status is set to Flagged; change it to Live once
          you&rsquo;ve checked it.
          {draft.pagesRead.length > 0 && (
            <> Read: {draft.pagesRead.join(", ")}.</>
          )}
        </p>
        {draft.fetchError && (
          <p className="text-xs text-destructive">
            Couldn&rsquo;t read the link ({draft.fetchError}) — drafted from
            the pasted text only.
          </p>
        )}
        {draft.missing.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
              Couldn&rsquo;t find
            </p>
            <ul className="mt-1 list-disc pl-5">
              {draft.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {draft.notes.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {draft.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>
      <ResourceForm draft={{ values: draft.values, filled: draft.filled }} />
    </div>
  );
}
