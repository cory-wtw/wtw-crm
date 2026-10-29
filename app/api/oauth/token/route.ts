import { CORS_HEADERS, oauthError } from "@/lib/mcp/oauth-core";
import { exchangeCode, refreshTokens } from "@/lib/mcp/oauth";

async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    );
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: Request) {
  const p = await readParams(request);
  const clientId = p.get("client_id") ?? "";
  const grantType = p.get("grant_type");

  const result =
    grantType === "authorization_code"
      ? await exchangeCode({
          code: p.get("code") ?? "",
          codeVerifier: p.get("code_verifier") ?? "",
          clientId,
          redirectUri: p.get("redirect_uri") ?? "",
        })
      : grantType === "refresh_token"
        ? await refreshTokens({ refreshToken: p.get("refresh_token") ?? "", clientId })
        : null;

  if (!result) return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  if (!result.ok) return oauthError("invalid_grant", result.error);
  return Response.json(result.tokens, {
    headers: { "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
