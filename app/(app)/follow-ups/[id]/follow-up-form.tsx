"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_OUTCOME_LABELS,
  type FollowUpOutcome,
} from "@/lib/schemas";
import { recordFollowUpAction, type FollowUpSummary } from "../actions";

type ReferredResource = { resourceId: string; resourceName: string };

type Answer = { outcome: FollowUpOutcome | ""; note: string };

export function FollowUpForm({
  veteranId,
  veteranName,
  referralEncounterId,
  resources,
}: {
  veteranId: string;
  veteranName: string;
  referralEncounterId: string;
  resources: ReferredResource[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      resources.map((r) => [r.resourceId, { outcome: "", note: "" }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<FollowUpSummary | null>(null);

  const answered = resources.filter((r) => answers[r.resourceId]?.outcome);

  function setAnswer(resourceId: string, patch: Partial<Answer>) {
    setAnswers((current) => ({
      ...current,
      [resourceId]: { ...current[resourceId], ...patch },
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await recordFollowUpAction(veteranId, {
        referralEncounterId,
        outcomes: answered.map((r) => ({
          resourceId: r.resourceId,
          outcome: answers[r.resourceId].outcome as FollowUpOutcome,
          note: answers[r.resourceId].note.trim() || undefined,
        })),
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setSummary(response.summary);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-bold">Recorded for {veteranName}.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            They&rsquo;re closed out of the follow-up queue, and what they told
            you is on each resource&rsquo;s record.
          </p>
        </div>

        {summary.flagged.length > 0 && (
          <div className="rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-deep-gold)]/10 p-4 text-sm">
            <p className="font-bold">
              {summary.flagged.length === 1
                ? "One resource was flagged"
                : `${summary.flagged.length} resources were flagged`}
            </p>
            <p className="mt-1 text-muted-foreground">
              A second veteran couldn&rsquo;t reach them inside two months.
              They&rsquo;re held back from matching until somebody confirms
              they&rsquo;re still running.
            </p>
            <ul className="mt-2 space-y-1">
              {summary.flagged.map((resource) => (
                <li key={resource.resourceId}>
                  <Link
                    href={`/resources/${resource.resourceId}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {resource.organizationName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Link
            href="/follow-ups"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Back to the queue
          </Link>
          <Link
            href={`/veterans/${veteranId}`}
            className="text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            Open the record
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <ul className="space-y-4">
        {resources.map((resource) => (
          <li
            key={resource.resourceId}
            className="space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <p className="font-bold">
              <Link
                href={`/resources/${resource.resourceId}`}
                className="underline-offset-4 hover:underline"
              >
                {resource.resourceName}
              </Link>
            </p>

            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_OUTCOMES.map((outcome) => (
                <label
                  key={outcome}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`outcome-${resource.resourceId}`}
                    value={outcome}
                    checked={answers[resource.resourceId]?.outcome === outcome}
                    onChange={() =>
                      setAnswer(resource.resourceId, { outcome })
                    }
                    className="accent-[color:var(--wtw-brand-gold)]"
                  />
                  {FOLLOW_UP_OUTCOME_LABELS[outcome]}
                </label>
              ))}
            </div>

            <input
              type="text"
              value={answers[resource.resourceId]?.note ?? ""}
              onChange={(e) =>
                setAnswer(resource.resourceId, { note: e.target.value })
              }
              placeholder="Anything worth noting (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Leave anything you couldn&rsquo;t ask about blank — only what you
        answered gets recorded. Submitting closes {veteranName} out of the
        queue.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={answered.length === 0 || saving}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {saving
            ? "Recording…"
            : `Record ${answered.length || ""} and close out`.replace("  ", " ")}
        </button>
        <Link
          href="/follow-ups"
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
