"use server";

import { redirect } from "next/navigation";
import {
  clearSession,
  createSession,
  SignInRejected,
} from "@/lib/firebase/session";

export async function createSessionAction(
  idToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createSession(idToken);
    return { ok: true };
  } catch (error) {
    // Known rejections (not invited, deactivated) are written for the user.
    // Anything else is infrastructure — log it, don't hand its details to
    // someone who isn't signed in yet.
    if (error instanceof SignInRejected) {
      return { ok: false, error: error.message };
    }
    console.error("createSession failed", error);
    return { ok: false, error: "Could not create a session. Try again." };
  }
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
