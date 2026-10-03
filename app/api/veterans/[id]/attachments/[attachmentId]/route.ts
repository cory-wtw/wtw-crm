import { NextResponse } from "next/server";
import { getAttachment } from "@/lib/db/attachments";
import { mediaBucket } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { attachmentDisposition } from "@/lib/http";
import { canAccessCrm } from "@/lib/permissions";

/**
 * Streams one attachment back with Content-Disposition set to its display
 * name, not the storage filename. This route is the only way to read an
 * attachment: Storage rules deny client reads and no download token is kept.
 * `?inline=1` opens it in the browser's PDF viewer instead of downloading.
 */
export async function GET(
  req: Request,
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

  let bytes: Buffer;
  try {
    [bytes] = await mediaBucket().file(attachment.storagePath).download();
  } catch (err) {
    console.error("attachment download failed", attachmentId, err);
    return new NextResponse("That file is missing from storage.", {
      status: 404,
    });
  }
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(
        attachment.name,
        inline ? "inline" : "attachment",
      ),
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
