import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // The MCP endpoint and the connector sign-in endpoints authenticate with
  // bearer tokens and PKCE (lib/mcp/oauth.ts), not a session cookie, and must
  // not be bounced to /login.
  if (
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/oauth/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (hasSession) {
      const next = request.nextUrl.searchParams.get("next");
      const target = next?.startsWith("/oauth/authorize?") ? next : "/";
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
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
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Next requires the matcher pattern to be a static literal. The same pattern
// lives in lib/proxy-matcher.ts where it's tested — keep them in sync.
export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
