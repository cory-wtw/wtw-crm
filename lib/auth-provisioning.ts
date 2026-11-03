import type { Invite, User, UserRole } from "./schemas";

/** Invites stop working this many days after they were (re)sent. */
export const INVITE_TTL_DAYS = 7;

/** The org's Google Workspace domain. Invites outside it need an override. */
export const ORG_EMAIL_DOMAIN = "worththeirweight.org";

/** Flag an active user whose last login is older than this. */
export const STALE_LOGIN_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An invite is expired once INVITE_TTL_DAYS have passed since `invitedAt`.
 * Resending an invite resets `invitedAt`, which un-expires it.
 */
export function isInviteExpired(
  invite: Pick<Invite, "invitedAt">,
  now: Date = new Date(),
): boolean {
  const sentAt = invite.invitedAt.getTime();
  // A missing or unparseable date fails closed.
  if (Number.isNaN(sentAt)) return true;
  return now.getTime() - sentAt > INVITE_TTL_DAYS * DAY_MS;
}

/** True when the email's domain is exactly the org domain (case-insensitive). */
export function isOrgEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).trim().toLowerCase() === ORG_EMAIL_DOMAIN;
}

/**
 * True when an active user hasn't signed in for STALE_LOGIN_DAYS. A user
 * who has never signed in is not "stale" — they're just new.
 */
export function isLastLoginStale(
  lastLoginAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastLoginAt) return false;
  return now.getTime() - lastLoginAt.getTime() > STALE_LOGIN_DAYS * DAY_MS;
}

/**
 * Decision the auth provisioner makes when a verified Firebase user
 * attempts to create a session. Pure function — no I/O.
 *
 * - allow: the user already exists and is active; just mint the session.
 * - provision: this is a first-time sign-in matching a pending invite;
 *   create the user record (and apply role) before minting the session.
 * - reject: no user, no invite, an expired invite, or the user is deactivated.
 */
export type AuthDecision =
  | { action: "allow"; user: User }
  | { action: "provision"; role: UserRole; email: string }
  | { action: "reject"; reason: string };

export function decideAuth(input: {
  email: string;
  existingUser: User | null;
  existingInvite: Invite | null;
  now?: Date;
}): AuthDecision {
  if (input.existingUser) {
    if (!input.existingUser.active) {
      return {
        action: "reject",
        reason: "This account has been deactivated. Ask an admin.",
      };
    }
    return { action: "allow", user: input.existingUser };
  }
  if (input.existingInvite) {
    if (isInviteExpired(input.existingInvite, input.now)) {
      return {
        action: "reject",
        reason: "This invite has expired. Ask an admin to resend it.",
      };
    }
    return {
      action: "provision",
      role: input.existingInvite.role,
      email: input.email,
    };
  }
  return {
    action: "reject",
    reason: "Your account isn't on the allowlist. Ask an admin to invite you.",
  };
}
