import { NextResponse } from "next/server";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { listResources } from "@/lib/db/resources";
import { listVeterans } from "@/lib/db/veterans";
import { buildPublicImpact } from "@/lib/finance/public-impact";

/**
 * GET /api/public/impact — the totals worththeirweight.org shows. Open to
 * anyone (no session), so it returns counts and sums only. The CDN keeps a
 * copy for an hour so site traffic doesn't hit Firestore.
 */
export async function GET() {
  const [veterans, transactions, categories, resources] = await Promise.all([
    listVeterans(),
    listTransactions(),
    listCategories(),
    listResources(),
  ]);
  const body = buildPublicImpact({
    veterans,
    transactions,
    categories,
    resourceCount: resources.length,
    now: new Date(),
  });
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
