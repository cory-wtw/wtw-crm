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
import {
  createReferralAction,
  type Candidate,
  type IntakeResult,
  type ReferralResult,
} from "../actions";
import { CrisisLine } from "./intake-form";

/** How many resources go in one referral packet. */
const PACKET_SIZE = 5;

const FIELD_LABELS: Record<
  ReferralResult["substitutions"][number]["field"],
  string
> = {
  description: "description",
  services: "services line",
  eligibilityNotes: "eligibility notes",
  whatToBring: "what-to-bring line",
};

/**
 * Fields with no neutral stand-in. A replaced description still says something
 * true ("ask them what they can help with"); an invented eligibility line or
 * bring-list would not, so those are dropped instead.
 */
const DROPPED_FIELDS: ReferralResult["substitutions"][number]["field"][] = [
  "eligibilityNotes",
  "whatToBring",
];

const PATTERN_LABELS: Record<
  ReferralResult["substitutions"][number]["pattern"],
  string
> = {
  money: "a dollar figure",
  "outcome-or-claim": "an outcome or a claim",
};

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
  const [referral, setReferral] = useState<ReferralResult | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [copied, setCopied] = useState(false);
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

  /**
   * Approve the packet. This is the only path that writes a referral, and it
   * runs because a person clicked — nothing here is automatic, and nothing is
   * sent: staff copies the text into their own mail client.
   */
  async function approve() {
    setApproveError(null);
    setApproving(true);
    try {
      const chosen = selected
        .map((id) => {
          const matched = result.candidates.findIndex((c) => c.id === id);
          return {
            resourceId: id,
            // Resources staff added by hand were never ranked by the matcher.
            // They sort after everything it did rank and carry a zero score,
            // which is the honest record of what happened.
            matchedRank: matched === -1 ? Number.MAX_SAFE_INTEGER : matched,
            score: matched === -1 ? 0 : result.candidates[matched].score,
          };
        })
        .sort((a, b) => a.matchedRank - b.matchedRank)
        // rank is the position in the packet as sent, so it stays unique even
        // when two hand-added resources would otherwise tie.
        .map(({ resourceId, score }, index) => ({
          resourceId,
          rank: index,
          score,
        }));

      const response = await createReferralAction(veteranId, {
        bucketsIdentified: result.needs,
        referrals: chosen,
      });
      if (!response.ok) {
        setApproveError(response.error);
        return;
      }
      setReferral(response.result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setApproving(false);
    }
  }

  async function copyText() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.referralText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The text is on screen and
      // selectable, so say so rather than failing silently.
      setApproveError("Couldn't copy — select the text and copy it by hand.");
    }
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  }

  if (referral) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-black tracking-tight">
            Referral recorded for {veteranName}
          </h2>
          <p className="text-sm text-muted-foreground">
            It&rsquo;s on their timeline. Follow-up is due{" "}
            {formatDate(referral.followUpDue)}. Nothing has been sent — copy
            the text below into your own email and send it yourself.
          </p>
        </div>

        {referral.substitutions.length > 0 && (
          <div className="rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-deep-gold)]/10 p-4 text-sm">
            <p className="font-bold">
              {referral.substitutions.length === 1
                ? "One line was replaced before this packet was written"
                : `${referral.substitutions.length} lines were replaced before this packet was written`}
            </p>
            <ul className="mt-2 space-y-1">
              {referral.substitutions.map((substitution, index) => (
                <li key={`${substitution.resourceId}-${index}`}>
                  <Link
                    href={`/resources/${substitution.resourceId}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {substitution.organizationName}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    — its {FIELD_LABELS[substitution.field]} mentioned{" "}
                    {PATTERN_LABELS[substitution.pattern]} (
                    {substitution.match}), so that line is{" "}
                    {DROPPED_FIELDS.includes(substitution.field)
                      ? "not in the packet"
                      : "replaced with a neutral one"}
                    . Fix the record so the next packet reads better.
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Read the text below before you send it.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
              What to send
            </h3>
            <button
              type="button"
              onClick={copyText}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
            >
              {copied ? "Copied" : "Copy to clipboard"}
            </button>
          </div>
          <pre className="mobile-touch-scroll overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm">
            {referral.referralText}
          </pre>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-6">
          <Link
            href={`/veterans/${veteranId}`}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Back to the record
          </Link>
        </div>
      </div>
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
          <div className="flex flex-wrap items-center gap-3">
            {approveError && (
              <p className="text-xs text-destructive">{approveError}</p>
            )}
            <button
              type="button"
              onClick={approve}
              disabled={selected.length === 0 || approving}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
            >
              {approving
                ? "Recording…"
                : `Approve ${selected.length || ""} and write the referral`.replace(
                    "  ",
                    " ",
                  )}
            </button>
          </div>
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

          {candidate.eligibilityNotes && (
            <p className="rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-xs">
              <span className="font-bold">Who they take: </span>
              {candidate.eligibilityNotes}
            </p>
          )}

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
