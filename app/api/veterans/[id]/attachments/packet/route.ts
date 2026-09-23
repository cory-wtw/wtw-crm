import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { listAttachmentsForVeteran } from "@/lib/db/attachments";
import { getVeteran } from "@/lib/db/veterans";
import { mediaBucket } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { attachmentDisposition } from "@/lib/http";
import { formatShortName } from "@/lib/name";
import { canAccessCrm } from "@/lib/permissions";

/**
 * Merges every attachment for a veteran into one multi-page PDF, oldest
 * first. Cheap because each attachment is already a PDF (see
 * lib/pdf-convert.ts) — this just copies pages, no image work happens here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !canAccessCrm(session)) {
    return new NextResponse("Not authorized.", { status: 403 });
  }

  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) return new NextResponse("Not found.", { status: 404 });

  const attachments = await listAttachmentsForVeteran(id);
  if (attachments.length === 0) {
    return new NextResponse("No files to download.", { status: 404 });
  }
  const chronological = attachments.slice().reverse();

  const merged = await PDFDocument.create();
  for (const attachment of chronological) {
    const [bytes] = await mediaBucket()
      .file(attachment.storagePath)
      .download();
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const out = await merged.save();
  const body = out.buffer.slice(
    out.byteOffset,
    out.byteOffset + out.byteLength,
  ) as ArrayBuffer;
  const name = `${formatShortName(veteran.firstName, veteran.lastInitial)} files`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(name),
      "Content-Length": String(out.length),
    },
  });
}
