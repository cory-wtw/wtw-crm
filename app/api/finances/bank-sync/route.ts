import { timingSafeEqual } from "node:crypto";
import { runBankSync } from "@/lib/finance/bank-sync";

/**
 * Daily bank sync for a scheduler (Cloud Scheduler → POST with
 * `Authorization: Bearer $BANK_SYNC_SECRET`). Optional: without the secret
 * set, the route doesn't exist and syncing happens when someone opens
 * Finances, or with the Sync now button.
 */
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.BANK_SYNC_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: Request) {
  if (!process.env.BANK_SYNC_SECRET) return new Response("Not found", { status: 404 });
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runBankSync("system");
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Bank sync failed." },
      { status: 502 },
    );
  }
}
