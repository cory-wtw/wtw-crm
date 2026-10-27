"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { createAuthCode, getClient } from "@/lib/mcp/oauth";
import { isAdmin } from "@/lib/permissions";

/** The admin tapped Allow or Deny on the connector sign-in screen. Every
 *  parameter is re-checked here — the form is a request, not a grant. */
export async function decideAuthorizeAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const codeChallenge = String(formData.get("code_challenge") ?? "");
  const state = String(formData.get("state") ?? "");
  const allow = formData.get("decision") === "allow";

  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new Error("Unknown connector.");
  }
  const target = new URL(redirectUri);
  if (state) target.searchParams.set("state", state);

  const session = await getSession();
  if (!allow || !session || !isAdmin(session) || !codeChallenge) {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const code = await createAuthCode({
    clientId,
    redirectUri,
    codeChallenge,
    uid: session.uid,
    email: session.email,
  });
  target.searchParams.set("code", code);
  redirect(target.toString());
}
