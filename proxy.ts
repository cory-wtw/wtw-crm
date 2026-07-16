import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const target = new URL("/login", request.url);
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
