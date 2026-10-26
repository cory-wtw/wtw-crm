"use server";

import { listResources } from "@/lib/db/resources";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import {
  MAX_PASTE_CHARS,
  possibleDuplicates,
  type PossibleDuplicate,
} from "@/lib/quick-add";
import { draftFromPaste, type QuickAddResult } from "@/lib/quick-add-runner";

async function requireCrm() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (!canAccessCrm(session)) {
    return { ok: false as const, error: "Your account doesn't have access to this." };
  }
  return { ok: true as const };
}

/**
 * Draft a resource from a pasted link or text. Saves nothing — the draft goes
 * back to the browser and into the ordinary Add Resource form.
 */
export async function draftResourceAction(
  paste: unknown,
): Promise<{ ok: true; result: QuickAddResult } | { ok: false; error: string }> {
  const guard = await requireCrm();
  if (!guard.ok) return guard;

  if (typeof paste !== "string" || !paste.trim()) {
    return { ok: false, error: "Paste a link or some text first." };
  }
  if (paste.length > MAX_PASTE_CHARS) {
    return { ok: false, error: "That's too long — paste just the part about the organization." };
  }
  return draftFromPaste(paste);
}

/** Existing records that look like the one being entered. */
export async function checkDuplicatesAction(entry: {
  organizationName?: string;
  contactPhone?: string;
  website?: string;
}): Promise<PossibleDuplicate[]> {
  const guard = await requireCrm();
  if (!guard.ok) return [];

  const resources = await listResources();
  return possibleDuplicates(
    {
      organizationName: entry.organizationName?.slice(0, 300),
      contactPhone: entry.contactPhone?.slice(0, 300),
      website: entry.website?.slice(0, 500),
    },
    resources,
  );
}
