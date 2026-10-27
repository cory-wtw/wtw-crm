import { NextResponse } from "next/server";
import { clearSession } from "@/lib/firebase/session";

/**
 * A present-but-invalid session cookie (expired, deactivated user, revoked)
 * makes proxy.ts think the request is authenticated and let it through,
 * while the app layout finds no session and wants to bounce to /login —
 * which proxy.ts then bounces straight back since the cookie is still
 * there, looping forever. Server Components can't clear cookies, so the
 * layout redirects here instead: a route handler can, and does, before
 * sending the browser on to /login for real.
 */
export async function GET(request: Request) {
  await clearSession();
  const target = new URL("/login", request.url);
  // The connector sign-in comes back to itself after login; nothing else may.
  const next = new URL(request.url).searchParams.get("next");
  if (next?.startsWith("/oauth/authorize?")) target.searchParams.set("next", next);
  return NextResponse.redirect(target);
}
