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

/**
 * A "social" user is the restricted social media manager: they can reach the
 * Social wall and nothing else (no veteran/VSO/org/phone data).
 */
export function isSocialOnly(session: SessionLike | null): boolean {
  return session?.role === "social";
}

/** Signed in AND allowed to touch the core CRM data (i.e. not social-only). */
export function canAccessCrm(session: SessionLike | null): boolean {
  return !!session && session.role !== "social";
}

/**
 * Whether a given app path is part of the Social section. Used to keep
 * social-only users penned into /social. Pure so it can be unit-tested.
 */
export function isSocialPath(pathname: string): boolean {
  return pathname === "/social" || pathname.startsWith("/social/");
}

/** Anyone with CRM access can read any veteran. Social-only users cannot. */
export function canViewVeteran(session: SessionLike | null): boolean {
  return canAccessCrm(session);
}

/** Anyone with CRM access can create a veteran. Admin can choose the assignee;
 *  Standard always gets self-assigned. Social-only users cannot. */
export function canCreateVeteran(session: SessionLike | null): boolean {
  return canAccessCrm(session);
}

/** Admins can edit any veteran. Standard can only edit ones assigned to them. */
export function canEditVeteran(
  session: SessionLike | null,
  veteran: VeteranLike,
): boolean {
  if (!canAccessCrm(session)) return false;
  if (session!.role === "admin") return true;
  return veteran.assigneeUid === session!.uid;
}

/**
 * Running a concierge intake writes eligibility keys to the veteran record, so
 * it needs the same authority as editing one. Deliberately a separate predicate
 * from canEditVeteran even though the rule is identical today: the intake is
 * its own capability, and if the two ever diverge this is where it happens.
 */
export function canRunIntake(
  session: SessionLike | null,
  veteran: VeteranLike,
): boolean {
  return canEditVeteran(session, veteran);
}

/**
 * Approving a referral packet writes to the veteran's timeline and sets their
 * concierge status, so it needs the same authority as editing the record.
 *
 * Nothing else in the system may write a referral. There is no auto-send and no
 * background path — a person picks the resources and approves them, every time.
 */
export function canCreateReferral(
  session: SessionLike | null,
  veteran: VeteranLike,
): boolean {
  return canEditVeteran(session, veteran);
}

/**
 * Recording a follow-up writes to the veteran's timeline and to the resource
 * verification log, so it needs the same authority as editing the record.
 */
export function canRecordFollowUp(
  session: SessionLike | null,
  veteran: VeteranLike,
): boolean {
  return canEditVeteran(session, veteran);
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
  return canAccessCrm(session);
}

export function canEditPhone(session: SessionLike | null): boolean {
  return canAccessCrm(session);
}

/** Only admins manage users + invites. */
export function canManageUsers(session: SessionLike | null): boolean {
  return isAdmin(session);
}

/**
 * Approving an AI-proposed or imported record puts it in front of veterans, so
 * it is admin-only. The proposal itself is a machine's guess about an
 * organization it read a web page about; a person with authority over the
 * directory decides whether it becomes something we hand someone.
 */
export function canApproveImportedResource(
  session: SessionLike | null,
): boolean {
  return isAdmin(session);
}

/** Only admins view the audit log. */
export function canViewAuditLog(session: SessionLike | null): boolean {
  return isAdmin(session);
}

/** Anyone signed in can view the social media wall. */
export function canViewMedia(session: SessionLike | null): boolean {
  return !!session;
}

/** Anyone signed in can upload photos/videos to the social media wall. */
export function canUploadMedia(session: SessionLike | null): boolean {
  return !!session;
}

/**
 * Anyone signed in can flag media as used / new (the social media manager
 * works the wall, but we don't gate the toggle by a dedicated role yet).
 */
export function canMarkMediaUsed(session: SessionLike | null): boolean {
  return !!session;
}

/** Uploaders can delete their own media; admins can delete anything. */
export function canDeleteMedia(
  session: SessionLike | null,
  media: { createdBy: string },
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return media.createdBy === session.uid;
}

/** Uploaders can edit their own media's details; admins can edit anything. */
export function canEditMedia(
  session: SessionLike | null,
  media: { createdBy: string },
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return media.createdBy === session.uid;
}
