"use server";

import { redirect } from "next/navigation";
import { clearSession, createSession } from "@/lib/firebase/session";

export async function createSessionAction(
  idToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createSession(idToken);
    return { ok: true };
  } catch (error) {
    console.error("createSession failed", error);
    // Surface the real message so the user (and we) can see what's wrong.
    // The known user-facing reasons come from decideAuth(); infrastructure
    // errors (bad PEM, network) will also surface, which is the right
    // tradeoff while we're still bedding in production.
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not create a session. Try again.";
    return { ok: false, error: message };
  }
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
