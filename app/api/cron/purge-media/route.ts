import { NextResponse } from "next/server";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";
import { deserialize } from "@/lib/db/media";
import { isEligibleForPurge } from "@/lib/media-purge";

export const dynamic = "force-dynamic";

/**
 * Auto-purge endpoint for the social media wall. Deletes items that were
 * marked "used" more than 30 days ago — both the Storage file and the
 * Firestore doc. Point a scheduler (Cloud Scheduler, cron-job.org, a GitHub
 * Action, etc.) at this URL once a day:
 *
 *   curl -X POST https://<app>/api/cron/purge-media \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Protected by the CRON_SECRET env var. If CRON_SECRET is unset the endpoint
 * refuses to run (fail closed) so it can't be triggered anonymously.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();

  // Only "used" items are ever on the purge clock. Filter the exact due date
  // in code so we don't need a composite index.
  const snap = await adminDb
    .collection("media")
    .where("status", "==", "used")
    .get();

  const bucket = mediaBucket();
  let purged = 0;
  const errors: string[] = [];

  for (const doc of snap.docs) {
    const media = deserialize(doc.id, doc.data());
    if (!isEligibleForPurge(media, now)) continue;

    try {
      if (media.storagePath) {
        await bucket.file(media.storagePath).delete({ ignoreNotFound: true });
      }
      await doc.ref.delete();
      await logAudit({
        action: "delete",
        resourceType: "media",
        resourceId: doc.id,
      });
      purged += 1;
    } catch (err) {
      console.error("purge-media failed for", doc.id, err);
      errors.push(doc.id);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: snap.size,
    purged,
    failed: errors,
    at: now.toISOString(),
  });
}

export async function POST(request: Request) {
  return handle(request);
}

// Some schedulers only issue GETs; accept both, same auth check.
export async function GET(request: Request) {
  return handle(request);
}
