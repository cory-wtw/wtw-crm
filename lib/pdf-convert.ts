import { PDFDocument } from "pdf-lib";

/**
 * Browser-only. Converts an uploaded file into PDF bytes so every attachment
 * lands in Storage as a PDF: a real PDF passes through untouched, an image
 * is downscaled/recompressed as JPEG and wrapped in a single-page PDF. The
 * recompression is where the space savings actually come from — wrapping an
 * image in a PDF container on its own does not shrink it.
 */

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

export function isConvertibleFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export async function convertToPdf(file: File): Promise<Uint8Array> {
  if (file.type === "application/pdf") {
    return new Uint8Array(await file.arrayBuffer());
  }
  if (file.type.startsWith("image/")) {
    return imageToPdf(file);
  }
  throw new Error("Only images and PDFs are supported.");
}

async function imageToPdf(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!jpegBlob) throw new Error("Couldn't process that image.");
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  // 96 CSS px per inch, 72 pt per inch — keeps the page close to the
  // image's natural print size instead of blowing it up to full-page.
  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpegBytes);
  const pageWidth = width * (72 / 96);
  const pageHeight = height * (72 / 96);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(jpgImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return pdfDoc.save();
}
