import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/firebase/session";
import { canAccessCrm, isAdmin } from "@/lib/permissions";

/**
 * Page-level guards. Every page that reads data calls one of these itself.
 *
 * The (app) and admin layouts check the session too, but a layout is not an
 * access check: on client-side navigation Next renders only the segments
 * that changed, so a crafted RSC request can get a page without its parent
 * layout ever running. The check has to sit with the data.
 *
 * getSession is React.cache'd, so calling these alongside the layout's own
 * check costs nothing extra.
 */

/** Signed in, any role. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  // /logout, not /login: a stale cookie would make proxy.ts bounce /login.
  if (!session) redirect("/logout");
  return session;
}

/** Signed in with CRM access — i.e. not the social-only role. */
export async function requireCrm(): Promise<Session> {
  const session = await requireSession();
  if (!canAccessCrm(session)) redirect("/social");
  return session;
}

/** Admins only. Anyone else gets a 404 rather than a hint the page exists. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdmin(session)) notFound();
  return session;
}
