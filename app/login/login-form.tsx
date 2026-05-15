"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { createSessionAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<
    { kind: "error" | "info"; text: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  async function completeSignIn(idToken: string) {
    const result = await createSessionAction(idToken);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      await completeSignIn(idToken);
    } catch (err) {
      setMessage({ kind: "error", text: humanizeAuthError(err) });
    }
  }

  async function onGoogleSignIn() {
    setMessage(null);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await cred.user.getIdToken();
      await completeSignIn(idToken);
    } catch (err) {
      setMessage({ kind: "error", text: humanizeAuthError(err) });
    }
  }

  async function onForgotPassword() {
    setMessage(null);
    if (!email) {
      setMessage({
        kind: "error",
        text: "Type your email above, then tap Forgot password.",
      });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage({
        kind: "info",
        text: "Password reset email sent. Check your inbox.",
      });
    } catch (err) {
      setMessage({ kind: "error", text: humanizeAuthError(err) });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-bold">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="block text-sm font-bold">
            Password
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={isPending}
            className="text-xs text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline disabled:opacity-50"
          >
            Forgot password?
          </button>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>
      {message && (
        <p
          className={`text-sm ${
            message.kind === "error"
              ? "text-destructive"
              : "text-[color:var(--wtw-deep-gold)]"
          }`}
        >
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
      <div className="relative py-1 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span className="relative z-10 bg-card px-2">or</span>
        <span className="absolute inset-x-0 top-1/2 border-t border-border" />
      </div>
      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={isPending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
      >
        Sign in with Google
      </button>
    </form>
  );
}

function humanizeAuthError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/invalid-email":
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "That email and password don't match.";
      case "auth/user-disabled":
        return "This account has been disabled. Ask an admin.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a minute and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Sign-in was cancelled.";
      case "auth/network-request-failed":
        return "Network problem. Check your connection and try again.";
      default:
        return code;
    }
  }
  return "Something went wrong. Try again.";
}
