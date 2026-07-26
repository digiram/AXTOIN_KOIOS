/**
 * Validates super-admin–configured Nominatim base URLs before server-side `fetch` (SSRF guardrail).
 *
 * Override allowed hostnames with **`NOMINATIM_ALLOWED_HOSTS`** (comma-separated, case-insensitive).
 * Default allowlist: `nominatim.openstreetmap.org`.
 */

const DEFAULT_ALLOWED_HOSTS = ["nominatim.openstreetmap.org"];

const parseAllowedHosts = (): string[] => {
  const raw = process.env.NOMINATIM_ALLOWED_HOSTS?.trim();
  if (!raw) return DEFAULT_ALLOWED_HOSTS;
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parts.length > 0 ? parts : DEFAULT_ALLOWED_HOSTS;
};

const isPrivateOrMetadataHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return false;
  if (h === "0.0.0.0" || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  if (h.endsWith(".internal")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("169.254.")) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
};

/**
 * @throws Error with `statusCode` 400 when the base URL is unsafe or not allowlisted.
 */
export function assertNominatimBaseUrlAllowed(baseRaw: string): void {
  const raw = baseRaw.trim();
  if (!raw) {
    const err = new Error("Nominatim base URL is empty.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }

  let u: URL;
  try {
    u = new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`);
  } catch {
    const err = new Error("Nominatim base URL is not a valid URL.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }

  const protocol = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();

  if (protocol === "http:" && host !== "localhost" && host !== "127.0.0.1") {
    const err = new Error("Nominatim base URL must use https except for http://localhost or http://127.0.0.1.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  if (protocol !== "https:" && protocol !== "http:") {
    const err = new Error("Nominatim base URL must use http or https.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (isPrivateOrMetadataHost(host)) {
    const err = new Error("Nominatim base URL must not target private, link-local, or reserved internal hosts.");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }

  const allowed = parseAllowedHosts();
  if (!allowed.includes(host)) {
    const err = new Error(
      `Nominatim host "${host}" is not in NOMINATIM_ALLOWED_HOSTS. ` +
        `Set that variable to a comma-separated hostname allowlist (defaults to ${DEFAULT_ALLOWED_HOSTS.join(", ")}).`
    );
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
}
