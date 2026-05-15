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
