import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getRecord } from "@/lib/db/finance";
import { mediaBucket } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { attachmentDisposition } from "@/lib/http";
import { canManageFinances } from "@/lib/permissions";

/** Streams one finance record back to an admin, under its label. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !canManageFinances(session)) {
    return new NextResponse("Not authorized.", { status: 403 });
  }

  const { id } = await params;
  const record = await getRecord(id);
  if (!record) return new NextResponse("Not found.", { status: 404 });

  const [bytes] = await mediaBucket().file(record.storagePath).download();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ext = record.fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin";

  await logAudit({ action: "read", resourceType: "financeRecord", resourceId: id });

  return new NextResponse(body, {
    headers: {
      "Content-Type": record.contentType,
      "Content-Disposition": attachmentDisposition(record.label, ext),
      "Content-Length": String(bytes.length),
    },
  });
}
