"use server";

import { revalidatePath } from "next/cache";
import type { Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
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
    diff: { role: { before: null, after: role.data } },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function revokeInviteAction(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

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
    async (tx): Promise<ActionResult & { changed?: boolean }> => {
      const read = await readForUserWrite(tx, guard.session.uid, uid);
      if (!read.ok) return read;
      if (read.target.active === active) return { ok: true, changed: false };
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
      }
      tx.update(adminDb.collection("users").doc(uid), {
        active,
        updatedAt: new Date(),
      });
      return { ok: true, changed: true };
    },
  );
  if (!outcome.ok) return outcome;
  if (!outcome.changed) return { ok: true };

  if (!active) {
    // Revoke their refresh tokens so any open browser session ends quickly.
    await adminAuth.revokeRefreshTokens(uid);
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
