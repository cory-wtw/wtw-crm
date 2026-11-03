import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

const SESSION_COOKIE = "__session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Next reads the nonce back out of the request's Content-Security-Policy
  // header and stamps it on every script it emits; every page here renders
  // dynamically (they all read the session cookie), which nonces require.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, pathname);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const next = () => {
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // The MCP endpoint and the connector sign-in endpoints authenticate with
  // bearer tokens and PKCE (lib/mcp/oauth.ts), not a session cookie, and must
  // not be bounced to /login.
  // /api/public/* serves the public website's totals and needs no session.
  if (
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/oauth/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return next();
  }

  if (pathname === "/login") {
    if (hasSession) {
      const nextParam = request.nextUrl.searchParams.get("next");
      const target = nextParam?.startsWith("/oauth/authorize?") ? nextParam : "/";
      return NextResponse.redirect(new URL(target, request.url));
    }
    return next();
  }

  if (!hasSession) {
    const target = new URL("/login", request.url);
    // The connector sign-in has to come back to itself after Google, or
    // Claude never gets its code.
    if (pathname === "/oauth/authorize") {
      target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(target);
  }

  // Forward the path so the authenticated layout can enforce role-based
  // routing (it reads the session to know the role; the cookie here is
  // opaque and can't be decoded at the edge). Kept in a header rather than
  // a query param so it never leaks into the rendered URL.
  headers.set("x-pathname", pathname);
  return next();
}

// Next requires the matcher pattern to be a static literal. The same pattern
// lives in lib/proxy-matcher.ts where it's tested — keep them in sync.
export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
