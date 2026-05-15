import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "./admin";

const SESSION_COOKIE = "__session";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const EIGHT_HOURS_S = 8 * 60 * 60;

export type Session = {
  uid: string;
  email: string;
  role: "admin" | "standard" | null;
};

export async function createSession(idToken: string): Promise<void> {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: EIGHT_HOURS_MS,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionCookie, {
    maxAge: EIGHT_HOURS_S,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    const role = decoded.role as Session["role"] | undefined;
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      role: role ?? null,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie);
      await adminAuth.revokeRefreshTokens(decoded.uid);
    } catch {
      // already invalid; just clear the cookie
    }
  }
  store.delete(SESSION_COOKIE);
}
