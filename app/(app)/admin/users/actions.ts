"use server";

import { revalidatePath } from "next/cache";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { normalizeEmail, userRoleSchema } from "@/lib/schemas";

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

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function revokeInviteAction(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  await adminDb.collection("invites").doc(normalizeEmail(email)).delete();
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActiveAction(
  uid: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (uid === guard.session.uid && !active) {
    return { ok: false, error: "You can't deactivate yourself." };
  }

  await adminDb.collection("users").doc(uid).update({
    active,
    updatedAt: new Date(),
  });

  if (!active) {
    // Revoke their refresh tokens so any open browser session ends quickly.
    await adminAuth.revokeRefreshTokens(uid);
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function changeUserRoleAction(
  uid: string,
  rawRole: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const role = userRoleSchema.safeParse(rawRole);
  if (!role.success) {
    return { ok: false, error: "Pick a valid role." };
  }

  if (uid === guard.session.uid && role.data !== "admin") {
    return {
      ok: false,
      error: "You can't demote yourself out of admin.",
    };
  }

  await adminDb.collection("users").doc(uid).update({
    role: role.data,
    updatedAt: new Date(),
  });
  await adminAuth.setCustomUserClaims(uid, { role: role.data });

  revalidatePath("/admin/users");
  return { ok: true };
}
