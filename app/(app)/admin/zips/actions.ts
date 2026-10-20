"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/firebase/session";
import { isAdmin } from "@/lib/permissions";
import { applyZipBackfill } from "@/lib/zip-backfill";

/** Save the inferred ZIPs. The plan is rebuilt here, not taken from the
 *  browser — the preview is a draft, not an authorization. */
export async function applyZipBackfillAction(): Promise<
  { ok: true; written: number } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isAdmin(session)) return { ok: false, error: "Admins only." };

  const written = await applyZipBackfill({
    uid: session.uid,
    email: session.email ?? session.uid,
  });
  revalidatePath("/admin/zips");
  revalidatePath("/veterans");
  return { ok: true, written };
}
