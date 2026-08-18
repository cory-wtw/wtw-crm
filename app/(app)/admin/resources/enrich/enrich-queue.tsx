"use client";

import Link from "next/link";
import { useState } from "react";
import { parseUrlList } from "@/lib/enrich";
import { ProposalReview } from "./proposal-review";
import { enrichUrlAction, type EnrichResult } from "./actions";

type Row =
  | { url: string; state: "waiting" }
  | { url: string; state: "running" }
  | { url: string; state: "failed"; error: string }
  | { url: string; state: "ready"; result: EnrichResult }
  | { url: string; state: "approved"; resourceId: string }
  | { url: string; state: "discarded" };

export function EnrichQueue() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  function patch(url: string, next: Row) {
    setRows((current) => current.map((row) => (row.url === url ? next : row)));
  }

  async function run() {
    const { urls, invalid: bad } = parseUrlList(input);
    setInvalid(bad);
    if (urls.length === 0) return;

    setRows(urls.map((url) => ({ url, state: "waiting" as const })));
    setOpenUrl(null);
    setRunning(true);

    // Sequential on purpose: one page at a time keeps each request short, and
    // a failure costs that URL rather than the batch.
    for (const url of urls) {
      patch(url, { url, state: "running" });
      try {
        const response = await enrichUrlAction(url);
        if (response.ok) {
          patch(url, { url, state: "ready", result: response.result });
        } else {
          patch(url, { url, state: "failed", error: response.error });
        }
      } catch {
        patch(url, {
          url,
          state: "failed",
          error: "The request failed before it reached the server.",
        });
      }
    }

    setRunning(false);
  }

  const open = rows.find(
    (row): row is Extract<Row, { state: "ready" }> =>
      row.url === openUrl && row.state === "ready",
  );

  const ready = rows.filter((r) => r.state === "ready").length;
  const failed = rows.filter((r) => r.state === "failed").length;
  const approved = rows.filter((r) => r.state === "approved").length;

  if (open) {
    return (
      <ProposalReview
        result={open.result}
        onApproved={(resourceId) => {
          patch(open.url, { url: open.url, state: "approved", resourceId });
          setOpenUrl(null);
        }}
        onDiscard={() => {
          patch(open.url, { url: open.url, state: "discarded" });
          setOpenUrl(null);
        }}
        onBack={() => setOpenUrl(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-bold" htmlFor="urls">
          URLs, one per line
        </label>
        <textarea
          id="urls"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          placeholder={"https://example.org/veterans\nhttps://another.org/help"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={running || input.trim().length === 0}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
          >
            {running ? "Reading…" : "Read these pages"}
          </button>
          <p className="text-xs text-muted-foreground">
            One at a time, so a dead link costs that page and not the batch.
          </p>
        </div>
      </div>

      {invalid.length > 0 && (
        <div className="rounded-lg border border-[color:var(--wtw-deep-gold)]/40 bg-[color:var(--wtw-deep-gold)]/10 p-4 text-sm">
          <p className="font-bold">
            {invalid.length === 1
              ? "One line wasn't a URL"
              : `${invalid.length} lines weren't URLs`}
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
            {invalid.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            {rows.length} page{rows.length === 1 ? "" : "s"} · {ready} to review
            {approved > 0 && ` · ${approved} kept`}
            {failed > 0 && ` · ${failed} failed`}
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((row) => (
              <li
                key={row.url}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{row.url}</p>
                  <p className="mt-0.5 text-xs">
                    <RowStatus row={row} />
                  </p>
                </div>
                {row.state === "ready" && (
                  <button
                    type="button"
                    onClick={() => setOpenUrl(row.url)}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
                  >
                    Review
                  </button>
                )}
                {row.state === "approved" && (
                  <Link
                    href={`/resources/${row.resourceId}`}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
                  >
                    Open record
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RowStatus({ row }: { row: Row }) {
  switch (row.state) {
    case "waiting":
      return <span className="text-muted-foreground">Waiting…</span>;
    case "running":
      return <span className="text-muted-foreground">Reading the page…</span>;
    case "failed":
      return <span className="text-destructive">{row.error}</span>;
    case "ready":
      return (
        <span className="text-muted-foreground">
          Draft ready
          {row.result.unanswered.length > 0 &&
            ` · ${row.result.unanswered.length} field${
              row.result.unanswered.length === 1 ? "" : "s"
            } the page didn't answer`}
        </span>
      );
    case "approved":
      return <span className="font-bold">Kept as a flagged record</span>;
    case "discarded":
      return <span className="text-muted-foreground">Discarded</span>;
  }
}
