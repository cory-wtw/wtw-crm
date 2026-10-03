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
 * Ceiling on the source bytes merged into one packet. Everything is held in
 * memory on a 512 MiB instance (apphosting.yaml), and the merged output
 * roughly doubles it, so stay well under.
 */
const PACKET_MAX_BYTES = 120 * 1024 * 1024;

/**
 * Merges every attachment for a veteran into one multi-page PDF, oldest
 * first. Cheap because each attachment is already a PDF (see
 * lib/pdf-convert.ts) — this just copies pages, no image work happens here.
 *
 * One unreadable file (missing, encrypted, corrupt) is skipped rather than
 * failing the whole packet; the skipped names go in a response header.
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
  const totalBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  if (totalBytes > PACKET_MAX_BYTES) {
    return new NextResponse(
      "These files are too large to combine into one PDF. Download them one at a time.",
      { status: 413 },
    );
  }
  const chronological = attachments.slice().reverse();

  const downloads = await Promise.all(
    chronological.map(async (attachment) => {
      try {
        const [bytes] = await mediaBucket()
          .file(attachment.storagePath)
          .download();
        return { attachment, bytes };
      } catch (err) {
        console.error("packet download failed", attachment.id, err);
        return { attachment, bytes: null };
      }
    }),
  );

  const merged = await PDFDocument.create();
  const skipped: string[] = [];
  for (const { attachment, bytes } of downloads) {
    if (!bytes) {
      skipped.push(attachment.name);
      continue;
    }
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch (err) {
      console.error("packet merge failed", attachment.id, err);
      skipped.push(attachment.name);
    }
  }
  if (merged.getPageCount() === 0) {
    return new NextResponse("None of these files could be read.", {
      status: 422,
    });
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
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(skipped.length > 0
        ? { "X-Skipped-Files": encodeURIComponent(skipped.join(", ")) }
        : {}),
    },
  });
}
