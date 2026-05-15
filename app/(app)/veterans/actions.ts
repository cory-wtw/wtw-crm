"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import {
  type PipelineHistoryEntry,
  veteranInputSchema,
} from "@/lib/schemas";

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function createVeteranAction(
  rawInput: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = veteranInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "form"}: ${i.message}`)
        .join("; "),
    };
  }
  const input = parsed.data;

  const now = new Date();
  const stage = input.pipelineStage ?? "found";

  const historyEntry: PipelineHistoryEntry = {
    stage,
    enteredAt: now,
    byUid: session.uid,
  };

  // If the stage is `found` and no dateFound supplied, default to now.
  const dateFound = stage === "found" ? now : null;

  const doc = dropUndefined({
    ...input,
    pipelineStage: stage,
    pipelineHistory: [historyEntry],
    dateFound,
    dateConnected: null,
    dateFiled: null,
    dateWon: null,
    dateLost: null,
    vsoIds: input.vsoIds ?? [],
    assigneeUid: input.assigneeUid ?? null,
    anticipatedRateCode: input.anticipatedRateCode ?? null,
    actualRateCode: input.actualRateCode ?? null,
    assignedPhoneId: input.assignedPhoneId ?? null,
    createdBy: session.uid,
    createdAt: now,
    updatedBy: session.uid,
    updatedAt: now,
  });

  const ref = await adminDb.collection("veterans").add(doc);

  revalidatePath("/veterans");
  revalidatePath("/");
  return { ok: true, id: ref.id };
}

export async function redirectToVeteran(id: string): Promise<void> {
  redirect(`/veterans/${id}`);
}
