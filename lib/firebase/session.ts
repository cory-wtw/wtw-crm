import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth } from "./admin";
import { adminDb } from "./admin";
import { decideAuth } from "@/lib/auth-provisioning";
import {
  deleteInvite as deleteInviteDoc,
  getInvite,
} from "@/lib/db/invites";
import { getUser } from "@/lib/db/users";
import { normalizeEmail, type User } from "@/lib/schemas";

const SESSION_COOKIE = "__session";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const EIGHT_HOURS_S = 8 * 60 * 60;

export type Session = {
  uid: string;
  email: string;
  role: "admin" | "standard" | "social" | null;
};

/**
 * Verifies the Firebase ID token, runs the allowlist + provisioning
 * decision, and mints an 8-hour session cookie. Throws when the user
 * isn't allowed so the calling Server Action surfaces a clear error.
 */
export async function createSession(idToken: string): Promise<void> {
  const decoded = await adminAuth.verifyIdToken(idToken);
  if (!decoded.email) {
    throw new Error("Your Google account didn't provide an email address.");
  }

  const normalizedEmail = normalizeEmail(decoded.email);
  const [existingUser, existingInvite] = await Promise.all([
    getUser(decoded.uid),
    getInvite(normalizedEmail),
  ]);

  const decision = decideAuth({
    email: normalizedEmail,
    existingUser,
    existingInvite,
  });

  if (decision.action === "reject") {
    throw new Error(decision.reason);
  }

  const now = new Date();

  if (decision.action === "provision") {
    // First-time sign-in matching a pending invite: materialize the user,
    // set the role custom claim, and burn the invite.
    const userRef = adminDb.collection("users").doc(decoded.uid);
    await userRef.set({
      uid: decoded.uid,
      email: normalizedEmail,
      displayName: decoded.name ?? null,
      role: decision.role,
      active: true,
      createdAt: now,
      lastLoginAt: now,
    });
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: decision.role,
    });
    await deleteInviteDoc(normalizedEmail);
  } else {
    // Existing active user — just touch lastLoginAt.
    await adminDb
      .collection("users")
      .doc(decoded.uid)
      .update({ lastLoginAt: now });
  }

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

/**
 * Returns the current session, refreshing role + active from the users
 * collection on every call. Returns null for missing/invalid cookies,
 * deleted users, and deactivated users.
 *
 * Cached per-request via React.cache so multiple Server Components in
 * the same render only do one Firestore read.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    const user: User | null = await getUser(decoded.uid);
    if (!user || !user.active) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email ?? user.email,
      role: user.role,
    };
  } catch {
    return null;
  }
});

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
