import { NextResponse } from "next/server";
import { getAttachment } from "@/lib/db/attachments";
import { mediaBucket } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { attachmentDisposition } from "@/lib/http";
import { canAccessCrm } from "@/lib/permissions";

/**
 * Streams one attachment back with Content-Disposition set to its display
 * name, not the storage filename. Attachments are stored as PDFs already
 * (see lib/pdf-convert.ts), so this is a plain passthrough — no conversion
 * happens on download.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await getSession();
  if (!session || !canAccessCrm(session)) {
    return new NextResponse("Not authorized.", { status: 403 });
  }

  const { id, attachmentId } = await params;
  const attachment = await getAttachment(attachmentId);
  if (!attachment || attachment.veteranId !== id) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const [bytes] = await mediaBucket().file(attachment.storagePath).download();
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(attachment.name),
      "Content-Length": String(bytes.length),
    },
  });
}
