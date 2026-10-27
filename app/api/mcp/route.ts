import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CORS_HEADERS, publicOrigin } from "@/lib/mcp/oauth-core";
import { verifyAccessToken } from "@/lib/mcp/oauth";
import { buildRosterMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * The Roster MCP endpoint. No session cookie here: the bearer token from the
 * connector sign-in is the credential, and it's checked on every request —
 * a revoked grant or a deactivated admin is refused on the next call.
 * Stateless: a fresh server per request.
 */
async function handle(request: Request): Promise<Response> {
  const origin = publicOrigin(request);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const user = await verifyAccessToken(token);
  if (!user) {
    // Tells Claude where to sign in (RFC 9728).
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        ...CORS_HEADERS,
      },
    });
  }

  const server = buildRosterMcpServer(origin, user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON responses are fully built by now; nothing left to stream.
    await server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
