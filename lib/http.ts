import "server-only";

/**
 * Builds a Content-Disposition header value that downloads as `name.pdf`.
 * Includes both a plain ASCII fallback (filename=) and a UTF-8 encoded
 * form (filename*=) so names with accents/punctuation still work in
 * modern browsers per RFC 6266.
 */
export function attachmentDisposition(name: string): string {
  const base = name.trim() || "file";
  const ascii = base.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(base);
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encoded}.pdf`;
}
