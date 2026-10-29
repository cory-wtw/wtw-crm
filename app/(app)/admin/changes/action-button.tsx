"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Outcome = { ok: true; message: string } | { ok: false; error: string };

/** One tap, one server action, the result on screen. */
export function ActionButton({
  label,
  run,
  confirm,
  primary = false,
}: {
  label: string;
  run: () => Promise<Outcome>;
  confirm?: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function go() {
    if (confirm && !window.confirm(confirm)) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await run();
      setMessage(r.ok ? r.message : r.error);
      router.refresh();
    } catch (error) {
      // No console on a phone — the screen has to say what went wrong.
      setMessage(`Didn't save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={go}
        disabled={saving}
        className={
          primary
            ? "inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
            : "inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
        }
      >
        {saving ? "Saving…" : label}
      </button>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}

export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs">
        {text}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-bold transition-colors hover:bg-secondary"
      >
        {copied ? "Copied" : "Copy packet text"}
      </button>
    </div>
  );
}
