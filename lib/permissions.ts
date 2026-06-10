/**
 * Role-based access helpers. Pure functions, no I/O. Mirrors the RBAC
 * matrix in START.md so the UI, server actions, and Firestore rules
 * can all agree on what a user is allowed to do.
 *
 * UI uses these to hide buttons. Server actions use them to reject.
 * Firestore rules mirror the same logic (firestore.rules).
 */

import type { Session } from "./firebase/session";

type SessionLike = Pick<Session, "uid" | "role">;
type VeteranLike = { assigneeUid: string | null };

export function isAdmin(session: SessionLike | null): boolean {
  return session?.role === "admin";
}

/** Anyone signed in can read any veteran. */
export function canViewVeteran(session: SessionLike | null): boolean {
  return !!session;
}

/** Anyone signed in can create a veteran. Admin can choose the assignee;
 *  Standard always gets self-assigned. */
export function canCreateVeteran(session: SessionLike | null): boolean {
  return !!session;
}

/** Admins can edit any veteran. Standard can only edit ones assigned to them. */
export function canEditVeteran(
  session: SessionLike | null,
  veteran: VeteranLike,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return veteran.assigneeUid === session.uid;
}

/** Only admins can change the assignee of a veteran (reassign). */
export function canReassignVeteran(session: SessionLike | null): boolean {
  return isAdmin(session);
}

/** Only admins can delete a veteran. */
export function canDeleteVeteran(session: SessionLike | null): boolean {
  return isAdmin(session);
}

/** Anyone signed in can create / edit VSOs and phones. They're shared
 *  org-wide reference data — gating writes to admins meant standard users
 *  had to flag down a manager to add a partner or log a loaner. */
export function canEditVso(session: SessionLike | null): boolean {
  return !!session;
}

export function canEditPhone(session: SessionLike | null): boolean {
  return !!session;
}

/** Only admins manage users + invites. */
export function canManageUsers(session: SessionLike | null): boolean {
  return isAdmin(session);
}

/** Only admins view the audit log. */
export function canViewAuditLog(session: SessionLike | null): boolean {
  return isAdmin(session);
}
