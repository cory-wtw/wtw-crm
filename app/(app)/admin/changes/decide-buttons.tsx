"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideChangeAction } from "./actions";

export function DecideButtons({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setSaving(decision);
    setMessage(null);
    try {
      const response = await decideChangeAction(id, decision, note);
      setMessage(response.ok ? response.message : response.error);
      router.refresh();
    } catch (error) {
      // No console on a phone — the screen has to say what went wrong.
      setMessage(`Didn't save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note for Claude (optional)"
        className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide("approve")}
          disabled={saving !== null}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50 sm:flex-none"
        >
          {saving === "approve" ? "Saving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => decide("reject")}
          disabled={saving !== null}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border px-4 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50 sm:flex-none"
        >
          {saving === "reject" ? "Saving…" : "Reject"}
        </button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
