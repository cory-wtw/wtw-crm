"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
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
      <div className="flex items-center gap-1">
        {send.kind === "email" ? (
          <a href={send.href} className={BUTTON}>
            Send claim guide
          </a>
        ) : (
          <button type="button" onClick={onClick} className={BUTTON}>
            Send claim guide
          </button>
        )}
        <HelpPopover kind={send.kind} />
      </div>
      {status && (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}

function HelpPopover({ kind }: { kind: ClaimGuideSend["kind"] }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="How does Send claim guide work?"
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Send claim guide help"
          className="absolute right-0 top-12 z-20 w-72 rounded-lg border border-border bg-card p-4 text-left text-sm shadow-lg"
        >
          <p className="mb-2 font-bold">Sending the claim guide</p>
          {kind === "eight00" ? (
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Tap &ldquo;Send claim guide.&rdquo;</li>
              <li>
                The message with the guide link is copied, and 800.com opens in
                a new tab.
              </li>
              <li>
                In the veteran&rsquo;s conversation, click the message box and
                paste (Ctrl+V, or Cmd+V on a Mac; long-press &rarr; Paste on a
                phone).
              </li>
              <li>Hit send.</li>
            </ol>
          ) : (
            <p className="text-muted-foreground">
              This veteran prefers email. Tapping the button opens a new email
              with the guide link already written in. Review it and hit send.
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {kind === "eight00"
              ? "No 800.com conversation linked? The main inbox opens instead; find the veteran there. Link their thread on the Edit page to skip this next time."
              : "Nothing is sent until you hit send."}
          </p>
        </div>
      )}
    </div>
  );
}
