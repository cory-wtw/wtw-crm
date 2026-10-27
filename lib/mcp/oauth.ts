/**
 * Connector sign-in storage: registered clients, one-time codes, and grants.
 * Server-only; nothing here is readable from a browser (firestore.rules).
 *
 * A grant is one "Allow" tap by one admin for one Claude connector. Its
 * access and refresh tokens are stored only as hashes. Every request re-checks
 * that the grant isn't revoked and that the person is still an active admin,
 * so revoking a grant on Admin → Claude changes, or deactivating the user,
 * cuts Claude off on its very next call.
 */

import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUser } from "@/lib/db/users";
import {
  ACCESS_TOKEN_TTL_S,
  AUTH_CODE_TTL_S,
  REFRESH_TOKEN_TTL_S,
  hashSecret,
  isAllowedRedirectUri,
  newSecret,
  verifyPkce,
} from "./oauth-core";

const CLIENTS = "oauthClients";
const CODES = "oauthCodes";
const GRANTS = "oauthGrants";
const TOKENS = "oauthTokens";

export type OAuthClient = { clientId: string; clientName: string; redirectUris: string[] };

export type McpUser = { uid: string; email: string; grantId: string };

export type Grant = {
  id: string;
  email: string;
  clientName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/** Dynamic client registration (RFC 7591). Public clients only — PKCE is the
 *  proof, not a client secret. */
export async function registerClient(
  body: unknown,
): Promise<{ ok: true; client: OAuthClient } | { ok: false; error: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
  if (uris.length === 0 || uris.length > 10) {
    return { ok: false, error: "redirect_uris is required." };
  }
  const bad = uris.filter((u) => !isAllowedRedirectUri(u));
  if (bad.length > 0) {
    return { ok: false, error: `redirect_uri not allowed: ${bad.join(", ")}` };
  }
  const clientName =
    typeof b.client_name === "string" && b.client_name.trim()
      ? b.client_name.trim().slice(0, 100)
      : "Claude";
  const ref = adminDb.collection(CLIENTS).doc();
  await ref.set({ clientName, redirectUris: uris, createdAt: new Date() });
  return { ok: true, client: { clientId: ref.id, clientName, redirectUris: uris } };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.includes("/")) return null;
  const snap = await adminDb.collection(CLIENTS).doc(clientId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { clientId, clientName: d.clientName ?? "Claude", redirectUris: d.redirectUris ?? [] };
}

/** After the admin taps Allow: a one-time code bound to the client, the
 *  redirect and the PKCE challenge. */
export async function createAuthCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  uid: string;
  email: string;
}): Promise<string> {
  const code = newSecret();
  await adminDb
    .collection(CODES)
    .doc(hashSecret(code))
    .set({ ...input, expiresAt: new Date(Date.now() + AUTH_CODE_TTL_S * 1000) });
  return code;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
};

async function issueTokens(
  tx: FirebaseFirestore.Transaction,
  grantId: string,
  uid: string,
): Promise<TokenResponse> {
  const access = newSecret();
  const refresh = newSecret();
  const now = Date.now();
  tx.set(adminDb.collection(TOKENS).doc(hashSecret(access)), {
    grantId,
    uid,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000),
  });
  tx.update(adminDb.collection(GRANTS).doc(grantId), {
    refreshHash: hashSecret(refresh),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000),
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refresh,
  };
}

type Exchange = { ok: true; tokens: TokenResponse } | { ok: false; error: string };

/** authorization_code grant. The code is single-use: it's deleted in the same
 *  transaction that checks it. */
export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<Exchange> {
  const codeRef = adminDb.collection(CODES).doc(hashSecret(input.code));
  const client = await getClient(input.clientId);
  if (!client) return { ok: false, error: "Unknown client." };

  return adminDb.runTransaction(async (tx): Promise<Exchange> => {
    const snap = await tx.get(codeRef);
    if (!snap.exists) return { ok: false, error: "Code is invalid or already used." };
    const c = snap.data()!;
    tx.delete(codeRef);
    if ((toDate(c.expiresAt)?.getTime() ?? 0) < Date.now()) {
      return { ok: false, error: "Code expired." };
    }
    if (c.clientId !== input.clientId || c.redirectUri !== input.redirectUri) {
      return { ok: false, error: "Code was issued to a different client." };
    }
    if (!verifyPkce(input.codeVerifier, c.codeChallenge)) {
      return { ok: false, error: "PKCE check failed." };
    }
    const grantRef = adminDb.collection(GRANTS).doc();
    tx.set(grantRef, {
      uid: c.uid,
      email: c.email,
      clientId: client.clientId,
      clientName: client.clientName,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    });
    return { ok: true, tokens: await issueTokens(tx, grantRef.id, c.uid) };
  });
}

/** refresh_token grant. Rotates: the old refresh token stops working. */
export async function refreshTokens(input: {
  refreshToken: string;
  clientId: string;
}): Promise<Exchange> {
  const found = await adminDb
    .collection(GRANTS)
    .where("refreshHash", "==", hashSecret(input.refreshToken))
    .limit(1)
    .get();
  if (found.empty) return { ok: false, error: "Refresh token is invalid." };
  const grantRef = found.docs[0].ref;

  return adminDb.runTransaction(async (tx): Promise<Exchange> => {
    const snap = await tx.get(grantRef);
    const g = snap.data()!;
    if (g.refreshHash !== hashSecret(input.refreshToken)) {
      return { ok: false, error: "Refresh token was already used." };
    }
    if (g.revokedAt) return { ok: false, error: "Access was revoked." };
    if (g.clientId !== input.clientId) return { ok: false, error: "Wrong client." };
    if ((toDate(g.refreshExpiresAt)?.getTime() ?? 0) < Date.now()) {
      return { ok: false, error: "Refresh token expired. Sign in again." };
    }
    const user = await getUser(g.uid);
    if (!user?.active || user.role !== "admin") {
      return { ok: false, error: "This account no longer has admin access." };
    }
    return { ok: true, tokens: await issueTokens(tx, grantRef.id, g.uid) };
  });
}

/**
 * Who a bearer token belongs to, or null. Checked on every MCP request: the
 * token is live, its grant isn't revoked, and the person is still an active
 * admin right now.
 */
export async function verifyAccessToken(token: string): Promise<McpUser | null> {
  if (!token) return null;
  const snap = await adminDb.collection(TOKENS).doc(hashSecret(token)).get();
  if (!snap.exists) return null;
  const t = snap.data()!;
  if ((toDate(t.expiresAt)?.getTime() ?? 0) < Date.now()) return null;

  const [grant, user] = await Promise.all([
    adminDb.collection(GRANTS).doc(t.grantId).get(),
    getUser(t.uid),
  ]);
  if (!grant.exists || grant.data()!.revokedAt) return null;
  if (!user?.active || user.role !== "admin") return null;

  // Last-used is for the sessions list; a failure here mustn't fail the call.
  grant.ref.update({ lastUsedAt: new Date() }).catch(() => {});
  return { uid: t.uid, email: user.email, grantId: t.grantId };
}

export async function listGrants(): Promise<Grant[]> {
  const snap = await adminDb.collection(GRANTS).where("revokedAt", "==", null).get();
  return snap.docs
    .map((d) => {
      const g = d.data();
      return {
        id: d.id,
        email: g.email ?? "",
        clientName: g.clientName ?? "Claude",
        createdAt: toDate(g.createdAt) ?? new Date(0),
        lastUsedAt: toDate(g.lastUsedAt),
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeGrant(grantId: string): Promise<void> {
  await adminDb
    .collection(GRANTS)
    .doc(grantId)
    .update({ revokedAt: new Date(), refreshHash: null });
}
