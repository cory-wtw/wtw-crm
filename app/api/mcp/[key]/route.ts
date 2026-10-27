import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isValidMcpKey } from "@/lib/mcp/auth";
import { buildRosterMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ key: string }> };

/**
 * The Roster MCP endpoint, for Claude's custom connectors. No session cookie
 * here — the secret key in the path is the credential, and the proxy lets
 * this one path through. Stateless: a fresh server per request.
 *
 * A wrong key gets the same 404 as the endpoint being switched off, so the
 * URL doesn't confirm it exists.
 */
async function handle(request: Request, { params }: Context): Promise<Response> {
  const { key } = await params;
  if (!isValidMcpKey(key)) return new NextResponse("Not found.", { status: 404 });

  const server = buildRosterMcpServer(new URL(request.url).origin);
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
