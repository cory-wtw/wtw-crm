import type { Invite, User, UserRole } from "./schemas";

/**
 * Decision the auth provisioner makes when a verified Firebase user
 * attempts to create a session. Pure function — no I/O.
 *
 * - allow: the user already exists and is active; just mint the session.
 * - provision: this is a first-time sign-in matching a pending invite;
 *   create the user record (and apply role) before minting the session.
 * - reject: no user, no invite, or the user is deactivated.
 */
export type AuthDecision =
  | { action: "allow"; user: User }
  | { action: "provision"; role: UserRole; email: string }
  | { action: "reject"; reason: string };

export function decideAuth(input: {
  email: string;
  existingUser: User | null;
  existingInvite: Invite | null;
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

/**
 * The Firebase Auth custom claims a user should carry. Storage rules grant
 * uploads by the `role` claim alone, so a deactivated user carries none —
 * their still-valid ID token stops working at its next refresh.
 */
export function claimsForUser(user: {
  role: UserRole;
  active: boolean;
}): { role?: UserRole } {
  return user.active ? { role: user.role } : {};
}

/**
 * Whether a verified ID token may be used to claim an invite or a session.
 *
 * Invites are keyed by email, so the email must be one the identity provider
 * vouched for. Only Google sign-in is offered; if another provider (say
 * email/password) were ever switched on in the console, an unverified
 * account registered under an invited address must not walk off with it.
 */
export function isTrustedSignIn(token: {
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
}): boolean {
  return (
    !!token.email &&
    token.email_verified === true &&
    token.firebase?.sign_in_provider === "google.com"
  );
}
