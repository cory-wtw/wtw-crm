/**
 * The pure half of the connector sign-in (OAuth 2.1 with PKCE), so it can be
 * tested without Firestore. lib/mcp/oauth.ts does the storage.
 */

import { createHash, randomBytes } from "node:crypto";

/** Access tokens are short; a stolen one is worth an hour. */
export const ACCESS_TOKEN_TTL_S = 60 * 60;
/** Refresh tokens rotate on every use and lapse after 30 idle days. */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_S = 5 * 60;

/**
 * Where a sign-in may send its code back to: Claude's own connector callback,
 * exactly, or a local port for Claude Code / Claude Desktop. Anything else is
 * refused at registration, so a look-alike site can't collect a code for
 * someone's account even if they're tricked into approving it.
 */
const CLAUDE_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const MAX_REDIRECT_URI_LENGTH = 500;

export function isAllowedRedirectUri(uri: string): boolean {
  if (uri.length > MAX_REDIRECT_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (CLAUDE_CALLBACKS.has(`${url.origin}${url.pathname}`) && !url.search) return true;
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/** A secret worth handing out: 32 random bytes, URL-safe. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** What's stored instead of a secret, so a database read leaks no tokens. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** PKCE S256: the verifier the client sends must hash to the challenge it
 *  sent at the start. Plain challenges aren't accepted. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

/** OAuth error body, per RFC 6749 §5.2. */
export function oauthError(error: string, description: string, status = 400): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } },
  );
}

/** The sign-in endpoints carry no cookies, so any origin may call them —
 *  browser-based MCP clients need that. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version",
};

/** The origin the outside world reached us on. Behind App Hosting the
 *  request URL can carry the internal host; the forwarded headers don't. */
export function publicOrigin(request: Request): string {
  // Configured beats inferred: a forwarded header is only as trustworthy as
  // whatever sits in front of us.
  const configured = process.env.APP_ORIGIN?.replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** RFC 8414 metadata for this server as its own authorization server. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["roster"],
  };
}

/** RFC 9728 metadata: the MCP endpoint and who issues its tokens. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["roster"],
  };
}
