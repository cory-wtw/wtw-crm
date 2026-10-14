"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { humanizeAuthError } from "@/lib/auth-errors";
import { createSessionAction } from "./actions";

/**
 * Where sign-in is up to. Anything but "idle" locks the form: after the
 * Google popup closes there are several quiet seconds (session cookie, then
 * the first page render — much longer in dev while it compiles) where a
 * second click would start the whole flow over.
 */
type Phase = "idle" | "google" | "session" | "loading";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  google: "Waiting for Google…",
  session: "Signing you in…",
  loading: "Loading the Roster…",
};

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [, startTransition] = useTransition();

  async function onGoogleSignIn() {
    if (phase !== "idle") return;
    setError(null);
    setPhase("google");
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      setPhase("session");
      const idToken = await cred.user.getIdToken();
      const result = await createSessionAction(idToken);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      // Stay locked from here on: this component unmounts when the Roster
      // renders, so there's nothing to reset.
      setPhase("loading");
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch (err) {
      setError(humanizeAuthError(err));
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {busy ? <Spinner /> : <GoogleMark />}
        {busy ? PHASE_LABEL[phase] : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-center text-xs text-muted-foreground">
        Use your Worth Their Weight Google account. If you can&rsquo;t sign
        in, ask an admin to invite you.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#FFFFFF"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#FFFFFF"
        opacity="0.85"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.92v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FFFFFF"
        opacity="0.7"
        d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.95H.92A9 9 0 0 0 0 9c0 1.45.35 2.82.92 4.05l3.03-2.34Z"
      />
      <path
        fill="#FFFFFF"
        opacity="0.55"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.95l3.03 2.34C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

