"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { GATE_FAILURE_LABELS, MATCH_FLAG_LABELS } from "@/lib/matching";
import {
  ACCESS_METHOD_LABELS,
  BUCKET_LABELS,
  TYPICAL_WAIT_LABELS,
} from "@/lib/schemas";
import type { Candidate, IntakeResult } from "../actions";
import { CrisisLine } from "./intake-form";

/** How many resources go in one referral packet. */
const PACKET_SIZE = 5;

export function IntakeResults({
  result,
  veteranId,
  veteranName,
  onStartOver,
}: {
  result: IntakeResult;
  veteranId: string;
  veteranName: string;
  onStartOver: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  // Resources staff pulled back in by hand from the excluded list.
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const addedBack = useMemo(
    () => result.excluded.filter((r) => addedIds.includes(r.id)),
    [result.excluded, addedIds],
  );

  const filteredExcluded = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = result.excluded.filter((r) => !addedIds.includes(r.id));
    if (!q) return pool;
    return pool.filter((r) => r.organizationName.toLowerCase().includes(q));
  }, [result.excluded, addedIds, query]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-6">
      {result.crisis && <CrisisLine />}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">
            {result.candidates.length === 0
              ? "Nothing cleared the gates"
              : `${result.candidates.length} for ${veteranName}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.crisis
              ? "Same-day options only. Everything else waits until they're safe."
              : `Ranked from ${result.consideredCount} resources in the directory. Pick ${PACKET_SIZE}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onStartOver}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to the questions
        </button>
      </div>

      {result.flags.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-deep-gold)]/10 p-4 text-sm">
          {result.flags.map((flag) => (
            <li key={flag} className="font-bold">
              {MATCH_FLAG_LABELS[flag]}
            </li>
          ))}
        </ul>
      )}

      {result.claimsLane && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-bold">Claims lane</p>
          <p className="mt-1 text-muted-foreground">
            They&rsquo;ve never filed, or they&rsquo;re not sure. Hand this to
            an accredited VSO —{" "}
            <Link
              href="/vsos"
              className="font-bold underline-offset-4 hover:underline"
            >
              the rolodex is here
            </Link>
            . We don&rsquo;t assess the claim.
          </p>
        </div>
      )}

      {result.candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">
            No resource in the directory clears every gate.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the excluded list below — a wrong gate value on one record is
            the usual cause.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {result.candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              rank={index + 1}
              checked={selected.includes(candidate.id)}
              onToggle={() => toggle(candidate.id)}
            />
          ))}
        </ul>
      )}

      {addedBack.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Added by hand
          </h3>
          <ul className="space-y-2">
            {addedBack.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <label className="flex items-center gap-2 font-bold">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    className="accent-[color:var(--wtw-brand-gold)]"
                  />
                  {r.organizationName}
                </label>
                <span className="text-xs text-muted-foreground">
                  Gated out: {r.failures.map((f) => GATE_FAILURE_LABELS[f]).join(", ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowExcluded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
          aria-expanded={showExcluded}
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            Everything else ({result.excluded.length})
          </span>
          <span className="text-xs text-muted-foreground">
            {showExcluded ? "Hide" : "Show why"}
          </span>
        </button>

        {showExcluded && (
          <div className="space-y-3 border-t border-border p-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the directory…"
              className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {filteredExcluded.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing else to show.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredExcluded.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/resources/${r.id}`}
                        className="font-bold underline-offset-4 hover:underline"
                      >
                        {r.organizationName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.failures.length === 0
                          ? "Passed the gates but ranked below the short list"
                          : r.failures
                              .map((f) => GATE_FAILURE_LABELS[f])
                              .join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddedIds((ids) => [...ids, r.id]);
                        setSelected((ids) => [...ids, r.id]);
                      }}
                      className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-secondary"
                    >
                      Add anyway
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-card/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-bold">{selected.length}</span> selected
            {selected.length > PACKET_SIZE && (
              <span className="text-muted-foreground">
                {" "}
                · a packet is usually {PACKET_SIZE}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Sending arrives next — nothing is written to{" "}
            <Link
              href={`/veterans/${veteranId}`}
              className="font-bold underline-offset-4 hover:underline"
            >
              the record
            </Link>{" "}
            yet beyond the four eligibility answers.
          </p>
        </div>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  rank,
  checked,
  onToggle,
}: {
  candidate: Candidate;
  rank: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const oneLiner = candidate.description ?? candidate.services;

  return (
    <li className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Include ${candidate.organizationName}`}
          className="mt-1 accent-[color:var(--wtw-brand-gold)]"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold">
              <span className="text-muted-foreground">{rank}. </span>
              <Link
                href={`/resources/${candidate.id}`}
                className="underline-offset-4 hover:underline"
              >
                {candidate.organizationName}
              </Link>
            </p>
            <span className="text-[11px] text-muted-foreground">
              score {candidate.score}
            </span>
          </div>

          {oneLiner && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {oneLiner}
            </p>
          )}

          <p className="text-sm">
            <span className="font-bold">
              {ACCESS_METHOD_LABELS[candidate.accessMethod]}:
            </span>{" "}
            {candidate.accessValue ?? "—"}
          </p>

          {candidate.whatToBring && (
            <p className="text-xs text-muted-foreground">
              Bring: {candidate.whatToBring}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {candidate.matchedBuckets.map((bucket) => (
              <span
                key={bucket}
                className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-bold uppercase tracking-[0.1em]"
              >
                {BUCKET_LABELS[bucket]}
              </span>
            ))}
            <span className="text-muted-foreground">
              Wait: {TYPICAL_WAIT_LABELS[candidate.typicalWait]}
            </span>
            <span className="text-muted-foreground">
              Verified {formatDate(candidate.lastVerified)}
            </span>
          </div>

          {candidate.flags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {candidate.flags.map((flag) => (
                <li
                  key={flag}
                  className="inline-flex items-center rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-2 py-0.5 text-[11px] font-bold text-[color:var(--wtw-deep-gold)]"
                >
                  {MATCH_FLAG_LABELS[flag]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
