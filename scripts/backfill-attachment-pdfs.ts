// Attachment PDF backfill.
//
// Usage:
//   npm run backfill-attachment-pdfs            # DRY RUN — reports only
//   npm run backfill-attachment-pdfs -- --commit   # actually writes
//
// Veteran attachments now always land in Storage as PDFs (images are
// downscaled/recompressed and wrapped in a single-page PDF at upload time —
// see lib/pdf-convert.ts). This backfills attachments uploaded before that
// change: for each non-PDF attachment, it downloads the original, converts
// it the same way, uploads the PDF alongside it, repoints the Firestore doc
// at the new file, then deletes the old Storage object.
//
// Idempotent: only attachments whose contentType isn't already
// "application/pdf" are touched.
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { adminDb, mediaBucket } from "@/lib/firebase/admin";

const COMMIT = process.argv.includes("--commit");

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 72;

type Counts = {
  seen: number;
  converted: number;
  skippedUnsupported: number;
  failed: number;
};

function pdfPathFor(storagePath: string): string {
  return storagePath.replace(/\.[^./]+$/, "") + ".pdf";
}

async function imageBytesToPdf(original: Buffer): Promise<Buffer> {
  const image = sharp(original).rotate(); // rotate() auto-applies EXIF orientation
  const meta = await image.metadata();
  const origWidth = meta.width ?? MAX_IMAGE_DIMENSION;
  const origHeight = meta.height ?? MAX_IMAGE_DIMENSION;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(origWidth, origHeight));
  const width = Math.round(origWidth * scale);
  const height = Math.round(origHeight * scale);

  const jpegBytes = await image
    .resize(width, height)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpegBytes);
  const pageWidth = width * (72 / 96);
  const pageHeight = height * (72 / 96);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(jpgImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return Buffer.from(await pdfDoc.save());
}

async function main() {
  console.log(
    COMMIT
      ? "Running attachment PDF backfill (COMMIT — writing changes)…"
      : "Running attachment PDF backfill (DRY RUN — no writes)…",
  );

  const snap = await adminDb.collection("attachments").get();
  const bucket = mediaBucket();
  const counts: Counts = { seen: 0, converted: 0, skippedUnsupported: 0, failed: 0 };

  for (const doc of snap.docs) {
    counts.seen++;
    const data = doc.data();
    const contentType: string = data.contentType ?? "";
    const storagePath: string = data.storagePath ?? "";
    const name: string = data.name ?? doc.id;

    if (contentType === "application/pdf") continue;
    if (!contentType.startsWith("image/") || !storagePath) {
      console.warn(`  skip ${doc.id} ("${name}"): unsupported contentType "${contentType}"`);
      counts.skippedUnsupported++;
      continue;
    }

    try {
      const [original] = await bucket.file(storagePath).download();
      const pdfBytes = await imageBytesToPdf(original);
      const newPath = pdfPathFor(storagePath);
      const token = randomUUID();

      console.log(
        `  ${doc.id} ("${name}"): ${original.length}B ${contentType} -> ${pdfBytes.length}B application/pdf`,
      );

      if (COMMIT) {
        const file = bucket.file(newPath);
        await file.save(pdfBytes, {
          metadata: {
            contentType: "application/pdf",
            metadata: { firebaseStorageDownloadTokens: token },
          },
        });
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(newPath)}?alt=media&token=${token}`;

        await doc.ref.update({
          storagePath: newPath,
          downloadUrl,
          contentType: "application/pdf",
          sizeBytes: pdfBytes.length,
        });

        await bucket
          .file(storagePath)
          .delete({ ignoreNotFound: true })
          .catch((err) => console.error(`    old file delete failed:`, err));
      }

      counts.converted++;
    } catch (err) {
      console.error(`  FAILED ${doc.id} ("${name}"):`, err);
      counts.failed++;
    }
  }

  console.log("\nSummary:");
  console.log(`  Attachments scanned:     ${counts.seen}`);
  console.log(`  Converted to PDF:        ${counts.converted}`);
  console.log(`  Skipped (unsupported):   ${counts.skippedUnsupported}`);
  console.log(`  Failed:                  ${counts.failed}`);
  if (!COMMIT) {
    console.log("\nDry run only. Re-run with `-- --commit` to apply.");
  } else {
    console.log("\nDone.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
