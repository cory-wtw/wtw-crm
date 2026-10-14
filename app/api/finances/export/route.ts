import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { pnlCsv, transactionsCsv } from "@/lib/finance/export";
import { pnlPdf } from "@/lib/finance/pdf";
import { describeRange, resolveRange, todayIso } from "@/lib/finance/range";
import { buildProfitAndLoss } from "@/lib/finance/report";
import { getSession } from "@/lib/firebase/session";
import { attachmentDisposition } from "@/lib/http";
import { canManageFinances } from "@/lib/permissions";

/**
 * GET /api/finances/export?kind=pnl|transactions&format=csv|pdf&from=&to=
 * (or &all=1). Same range rules as the /finances page.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageFinances(session)) {
    return new NextResponse("Not authorized.", { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const kind = params.kind === "transactions" ? "transactions" : "pnl";
  const format = params.format === "pdf" && kind === "pnl" ? "pdf" : "csv";
  const today = todayIso();
  const range = resolveRange(params, today);
  const label = describeRange(range);

  const [transactions, categories] = await Promise.all([
    listTransactions(),
    listCategories(),
  ]);

  await logAudit({
    action: "export",
    resourceType: "transaction",
    resourceId: `${kind}.${format} ${label}`,
  });

  const fileBase = `WTW ${kind === "pnl" ? "P&L" : "transactions"} ${label}`;

  if (format === "pdf") {
    const pdf = await pnlPdf(buildProfitAndLoss(transactions, categories, range), label, today);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(fileBase, "pdf"),
      },
    });
  }

  const csv =
    kind === "pnl"
      ? pnlCsv(buildProfitAndLoss(transactions, categories, range), label)
      : transactionsCsv(transactions, categories, range);
  // BOM so Excel opens it as UTF-8 instead of mangling names with accents.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentDisposition(fileBase, "csv"),
    },
  });
}
