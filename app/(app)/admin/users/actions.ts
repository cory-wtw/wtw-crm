"use server";

import { revalidatePath } from "next/cache";
import type { Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { isOrgEmail } from "@/lib/auth-provisioning";
import { getSession } from "@/lib/firebase/session";
import {
  deactivationBlockReason,
  roleChangeBlockReason,
} from "@/lib/permissions";
import {
  normalizeEmail,
  userRoleSchema,
  type UserRole,
} from "@/lib/schemas";

/** Firestore Admin throws gRPC status 5 (NOT_FOUND) when updating a missing doc. */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    ((err as { code: unknown }).code === 5 ||
      (err as { code: unknown }).code === "not-found")
  );
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { ok: false as const, error: "Not signed in." };
  }
  if (session.role !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }
  return { ok: true as const, session };
}

export async function inviteUserAction(
  rawEmail: unknown,
  rawRole: unknown,
  rawOutsideOrg: unknown = false,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (typeof rawEmail !== "string") {
    return { ok: false, error: "Email is required." };
  }
  const email = rawEmail.trim();
  if (!email) {
    return { ok: false, error: "Email is required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email doesn't look right." };
  }
  const role = userRoleSchema.safeParse(rawRole);
  if (!role.success) {
    return { ok: false, error: "Pick a valid role." };
  }

  const normalized = normalizeEmail(email);
  const outsideOrg = rawOutsideOrg === true;
  if (!isOrgEmail(normalized) && !outsideOrg) {
    return {
      ok: false,
      error:
        "That email is outside the org. Tick \"Outside the org (contractor)\" to invite it anyway.",
    };
  }

  // An invite for an existing user would let a deactivated account
  // re-provision as a brand-new user. Reactivate instead.
  const existing = await adminDb
    .collection("users")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  if (!existing.empty) {
    return {
      ok: false,
      error: "That email already belongs to a user (reactivate them instead).",
    };
  }

  await adminDb.collection("invites").doc(normalized).set({
    email: normalized,
    role: role.data,
    invitedBy: guard.session.uid,
    invitedAt: new Date(),
  });
  await logAudit({
    action: "create",
    resourceType: "invite",
    resourceId: normalized,
    diff: {
      role: { before: null, after: role.data },
      // Only recorded when an admin overrode the domain rule, so the audit
      // log shows who let an outside address in.
      ...(outsideOrg && !isOrgEmail(normalized)
        ? { outsideOrg: { before: null, after: true } }
        : {}),
    },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Reset the clock on an invite so it's usable for another INVITE_TTL_DAYS.
 * Works on fresh and expired invites alike; the email itself isn't re-sent
 * (the Roster never emails — the admin tells the person to sign in).
 */
export async function resendInviteAction(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (typeof email !== "string") {
    return { ok: false, error: "Email is required." };
  }

  const normalized = normalizeEmail(email);
  const ref = adminDb.collection("invites").doc(normalized);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "That invite no longer exists." };
  }
  const data = snap.data() ?? {};
  const before = {
    invitedAt: data.invitedAt?.toDate?.() ?? null,
    invitedBy: data.invitedBy ?? null,
  };
  const now = new Date();
  try {
    await ref.update({ invitedAt: now, invitedBy: guard.session.uid });
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: "That invite no longer exists." };
    }
    throw err;
  }
  await logAudit({
    action: "update",
    resourceType: "invite",
    resourceId: normalized,
    diff: {
      invitedAt: { before: before.invitedAt, after: now },
      invitedBy: { before: before.invitedBy, after: guard.session.uid },
    },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function revokeInviteAction(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (typeof email !== "string") {
    return { ok: false, error: "Email is required." };
  }

  const normalized = normalizeEmail(email);
  await adminDb.collection("invites").doc(normalized).delete();
  await logAudit({
    action: "delete",
    resourceType: "invite",
    resourceId: normalized,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

type ActionResult = { ok: true } | { ok: false; error: string };

type UserDoc = {
  role: UserRole | null;
  active: boolean;
  name: string;
  email: string | null;
};

function isValidUid(uid: unknown): uid is string {
  return typeof uid === "string" && uid.length > 0 && !uid.includes("/");
}

function readUserDoc(data: Record<string, unknown>): UserDoc {
  const role = userRoleSchema.safeParse(data.role);
  return {
    role: role.success ? role.data : null,
    active: data.active === true,
    name:
      (typeof data.displayName === "string" && data.displayName) ||
      (typeof data.email === "string" && data.email) ||
      "This user",
    email: (typeof data.email === "string" && data.email) || null,
  };
}

/**
 * Everything a user-management write needs, read inside one transaction so
 * the "last active admin" count can't go stale between the check and the
 * write (two admins demoting each other at once would otherwise both pass).
 */
async function readForUserWrite(
  tx: Transaction,
  actorUid: string,
  targetUid: string,
): Promise<
  | { ok: true; target: UserDoc; activeAdminCount: number }
  | { ok: false; error: string }
> {
  const users = adminDb.collection("users");
  const [actorSnap, targetSnap, adminsSnap] = await Promise.all([
    tx.get(users.doc(actorUid)),
    tx.get(users.doc(targetUid)),
    tx.get(
      users.where("role", "==", "admin").where("active", "==", true),
    ),
  ]);
  const actor = readUserDoc(actorSnap.data() ?? {});
  if (!actorSnap.exists || actor.role !== "admin" || !actor.active) {
    return { ok: false, error: "Your admin access has changed. Sign in again." };
  }
  if (!targetSnap.exists) {
    return { ok: false, error: "That user no longer exists." };
  }
  return {
    ok: true,
    target: readUserDoc(targetSnap.data() ?? {}),
    activeAdminCount: adminsSnap.size,
  };
}

export async function setUserActiveAction(
  uid: string,
  active: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!isValidUid(uid)) {
    return { ok: false, error: "Pick a valid user." };
  }

  const outcome = await adminDb.runTransaction(
    async (
      tx,
    ): Promise<
      ActionResult & { changed?: boolean; revokedInvite?: string | null }
    > => {
      const read = await readForUserWrite(tx, guard.session.uid, uid);
      if (!read.ok) return read;
      if (read.target.active === active) return { ok: true, changed: false };
      let revokedInvite: string | null = null;
      if (!active) {
        const blocked = deactivationBlockReason({
          actorUid: guard.session.uid,
          targetUid: uid,
          targetName: read.target.name,
          targetRole: read.target.role,
          targetActive: read.target.active,
          activeAdminCount: read.activeAdminCount,
        });
        if (blocked) return { ok: false, error: blocked };
        // On deactivate, also close the side door: a pending invite for the
        // same email would let a fresh Google account re-provision as a new
        // user. Idempotent — no-op when there's no invite. Both writes land
        // together in this transaction.
        if (read.target.email) {
          const normalized = normalizeEmail(read.target.email);
          const inviteSnap = await tx.get(
            adminDb.collection("invites").doc(normalized),
          );
          if (inviteSnap.exists) revokedInvite = normalized;
        }
      }
      tx.update(adminDb.collection("users").doc(uid), {
        active,
        updatedAt: new Date(),
      });
      if (revokedInvite) {
        tx.delete(adminDb.collection("invites").doc(revokedInvite));
      }
      return { ok: true, changed: true, revokedInvite };
    },
  );
  if (!outcome.ok) return outcome;
  if (!outcome.changed) return { ok: true };
  const revokedInvite = outcome.revokedInvite ?? null;

  if (!active) {
    // Revoke their refresh tokens so any open browser session ends quickly.
    await adminAuth.revokeRefreshTokens(uid);
  }
  if (revokedInvite) {
    await logAudit({
      action: "delete",
      resourceType: "invite",
      resourceId: revokedInvite,
      diff: { reason: { before: null, after: "user deactivated" } },
    });
  }

  await logAudit({
    action: "update",
    resourceType: "user",
    resourceId: uid,
    diff: { active: { before: !active, after: active } },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function changeUserRoleAction(
  uid: string,
  rawRole: unknown,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!isValidUid(uid)) {
    return { ok: false, error: "Pick a valid user." };
  }

  const role = userRoleSchema.safeParse(rawRole);
  if (!role.success) {
    return { ok: false, error: "Pick a valid role." };
  }

  const outcome = await adminDb.runTransaction(
    async (
      tx,
    ): Promise<ActionResult & { beforeRole?: UserRole | null }> => {
      const read = await readForUserWrite(tx, guard.session.uid, uid);
      if (!read.ok) return read;
      if (read.target.role === role.data) return { ok: true };
      const blocked = roleChangeBlockReason({
        actorUid: guard.session.uid,
        targetUid: uid,
        targetName: read.target.name,
        targetRole: read.target.role,
        targetActive: read.target.active,
        newRole: role.data,
        activeAdminCount: read.activeAdminCount,
      });
      if (blocked) return { ok: false, error: blocked };
      tx.update(adminDb.collection("users").doc(uid), {
        role: role.data,
        updatedAt: new Date(),
      });
      return { ok: true, beforeRole: read.target.role };
    },
  );
  if (!outcome.ok) return outcome;
  if (outcome.beforeRole === undefined) return { ok: true };

  await adminAuth.setCustomUserClaims(uid, { role: role.data });

  await logAudit({
    action: "update",
    resourceType: "user",
    resourceId: uid,
    diff: { role: { before: outcome.beforeRole, after: role.data } },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
