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
    return {
      ok: false,
      error:
        "Could not create a session. Make sure you have permission to access this app.",
    };
  }
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
