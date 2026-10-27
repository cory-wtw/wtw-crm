"use server";

import { getSession } from "@/lib/firebase/session";
import { createResource, editResource } from "@/lib/ops/resources";
import { canAccessCrm } from "@/lib/permissions";

/** The work is in lib/ops/resources.ts. */
export async function createResourceAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };
  return createResource(session, rawInput);
}

export async function editResourceAction(
  id: string,
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canAccessCrm(session))
    return { ok: false, error: "Your account doesn't have access to this." };
  return editResource(session, id, rawInput);
}
