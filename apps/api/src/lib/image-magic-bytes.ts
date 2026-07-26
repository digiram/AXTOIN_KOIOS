/** Detect image MIME from file header (magic bytes) — do not trust client `mimetype` alone. */

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = Buffer.from("GIF87a");
const GIF89 = Buffer.from("GIF89a");
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_MARKER = Buffer.from("WEBP");

const startsWith = (buf: Buffer, prefix: Buffer): boolean =>
  buf.length >= prefix.length && buf.subarray(0, prefix.length).equals(prefix);

export const detectImageMimeFromBuffer = (buf: Buffer): string | null => {
  if (buf.length < 4) return null;
  if (startsWith(buf, JPEG)) return "image/jpeg";
  if (startsWith(buf, PNG)) return "image/png";
  if (startsWith(buf, GIF87) || startsWith(buf, GIF89)) return "image/gif";
  if (
    startsWith(buf, WEBP_RIFF) &&
    buf.length >= 12 &&
    buf.subarray(8, 12).equals(WEBP_MARKER)
  ) {
    return "image/webp";
  }
  return null;
};

export const assertImageMimeMatchesBuffer = (buf: Buffer, declaredMime: string): void => {
  const detected = detectImageMimeFromBuffer(buf);
  if (!detected) {
    const err = new Error("File content is not a supported image format.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  const declared = declaredMime.trim().toLowerCase();
  const normalizedDeclared = declared === "image/jpg" ? "image/jpeg" : declared;
  if (normalizedDeclared !== detected) {
    const err = new Error("Image content does not match the declared file type.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
};
