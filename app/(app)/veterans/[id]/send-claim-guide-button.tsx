"use client";

import { useState } from "react";
import type { ClaimGuideSend } from "@/lib/claim-guide";

const BUTTON =
  "inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary";

/**
 * Texts go out through 800.com, which has no way to prefill a message from
 * a link. So this copies the message and opens the thread; staff paste and
 * send.
 */
export function SendClaimGuideButton({ send }: { send: ClaimGuideSend }) {
  const [status, setStatus] = useState<string | null>(null);

  if (send.kind === "email") {
    return (
      <a href={send.href} className={BUTTON}>
        Send claim guide
      </a>
    );
  }

  function onClick() {
    if (send.kind !== "eight00") return;
    // Start the copy before opening the tab, while the click still counts
    // as a user gesture.
    navigator.clipboard.writeText(send.message).then(
      () => setStatus("Copied. Paste it into 800.com and send."),
      () => setStatus(`Couldn't copy. Paste this in 800.com: ${send.message}`),
    );
    window.open(send.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={onClick} className={BUTTON}>
        Send claim guide
      </button>
      {status && (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
