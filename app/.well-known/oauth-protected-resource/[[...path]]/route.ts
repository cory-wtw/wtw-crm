import { CORS_HEADERS, protectedResourceMetadata, publicOrigin } from "@/lib/mcp/oauth-core";

// Served at the bare path and the path-suffixed one (…/api/mcp) — clients ask
// for either.
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(publicOrigin(request)), { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
