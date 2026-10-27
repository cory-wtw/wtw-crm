import { CORS_HEADERS, oauthError } from "@/lib/mcp/oauth-core";
import { registerClient } from "@/lib/mcp/oauth";

/** Dynamic client registration. Registering grants nothing — an admin still
 *  has to sign in and tap Allow. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await registerClient(body);
  if (!result.ok) return oauthError("invalid_redirect_uri", result.error);
  return Response.json(
    {
      client_id: result.client.clientId,
      client_name: result.client.clientName,
      redirect_uris: result.client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
