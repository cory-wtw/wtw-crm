"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/firebase/session";
import { isAdmin } from "@/lib/permissions";
import { approveGroup, decideChange } from "@/lib/change-requests-apply";
import { revokeGrant } from "@/lib/mcp/oauth";

/** Approve or reject one Claude change request. Admins only — this is the
 *  only door a change request has into the data. */
export async function decideChangeAction(
  id: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isAdmin(session)) return { ok: false, error: "Admins only." };
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, error: "Unknown decision." };
  }

  const result = await decideChange(
    id,
    decision,
    { uid: session.uid, email: session.email ?? session.uid },
    note,
  );
  revalidatePath("/admin/changes");
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/veterans");
  revalidatePath("/vsos");
  revalidatePath("/");
  return {
    ok: true,
    message: result.status === "approved" ? "Approved and saved." : "Rejected. Nothing changed.",
  };
}

/** Approve every pending request from one call, oldest first. */
export async function approveGroupAction(
  groupLabel: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isAdmin(session)) return { ok: false, error: "Admins only." };

  const { approved, stoppedAt } = await approveGroup(groupLabel, {
    uid: session.uid,
    email: session.email ?? session.uid,
  });
  revalidatePath("/admin/changes");
  revalidatePath("/veterans");
  revalidatePath("/");
  return stoppedAt
    ? { ok: false, error: `Approved ${approved}, then stopped: ${stoppedAt.error}` }
    : { ok: true, message: `Approved all ${approved}.` };
}

/** Disconnect one Claude connector. Its next call is refused. */
export async function revokeGrantAction(
  grantId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isAdmin(session)) return { ok: false, error: "Admins only." };
  await revokeGrant(grantId);
  revalidatePath("/admin/changes");
  return { ok: true, message: "Disconnected." };
}
