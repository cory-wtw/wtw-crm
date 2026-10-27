"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/firebase/session";
import { isAdmin } from "@/lib/permissions";
import { decideChange } from "@/lib/change-requests-apply";

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
