/**
 * Hostinger / LiteSpeed-safe content security policy helpers.
 *
 * On Hostinger production, **never** emit `Content-Security-Policy` as an HTTP response header from Node —
 * the LiteSpeed proxy can return HTTP 503 and mark the upstream unhealthy even for a small policy (~250 B).
 * Use {@link metaContentSecurityPolicy} in an HTML `<meta http-equiv="Content-Security-Policy">` instead.
 *
 * Opt out of meta-only mode on non-Hostinger hosts with `CSP_IN_META=off`.
 */

export type CspEnv = {
  nodeEnv?: string;
  cspInMeta?: string;
};

export type MetaCspOptions = {
  /** Extra `connect-src` hostnames (no scheme), e.g. `api.example.com`. */
  connectSrcHosts?: string[];
  /** Extra `img-src` hostnames (no scheme). */
  imgSrcHosts?: string[];
  /** When true, omit `'unsafe-inline'` from script-src (production Vite bundles load as external modules). */
  strictScriptSrc?: boolean;
};

/** Hostnames required by `@stripe/stripe-js` / Stripe Elements in the web SPA. */
export const STRIPE_CSP_HOSTS = {
  scriptSrc: ["js.stripe.com"],
  connectSrc: ["api.stripe.com"],
  frameSrc: ["js.stripe.com", "hooks.stripe.com"]
} as const;

/** Third-party image hosts referenced by the web UI. */
export const WEB_IMG_SRC_HOSTS = ["cdn.simpleicons.org"] as const;

/** Compact CSP directives for the API when CSP is allowed on HTTP headers (non–meta-only). */
export const API_CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  imgSrc: ["'self'", "data:"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"]
};

const normalizeEnv = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

export const shouldUseMetaCspOnly = (env: CspEnv = {}): boolean => {
  const cspInMeta = normalizeEnv(env.cspInMeta ?? process.env.CSP_IN_META);
  if (cspInMeta === "off" || cspInMeta === "false" || cspInMeta === "0") {
    return false;
  }
  const nodeEnv = normalizeEnv(env.nodeEnv ?? process.env.NODE_ENV);
  return nodeEnv === "production";
};

export type CspMode = "meta-only" | "http-header";

export const resolveCspMode = (env: CspEnv = {}): CspMode =>
  shouldUseMetaCspOnly(env) ? "meta-only" : "http-header";

const camelToDirective = (key: string): string =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Serialize CSP directives with `;` and no spaces after semicolons. */
export const serializeCspDirectives = (directives: Record<string, string[]>): string =>
  Object.entries(directives)
    .map(([key, values]) => `${camelToDirective(key)} ${values.join(" ")}`)
    .join(";");

const uniqueHosts = (hosts: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const host of hosts) {
    const trimmed = host.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

export const hostnameFromOrigin = (origin: string | undefined): string | undefined => {
  const trimmed = origin?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).hostname;
  } catch {
    return undefined;
  }
};

export const parseCommaSeparatedHosts = (value: string | undefined): string[] => {
  if (!value?.trim()) return [];
  return uniqueHosts(value.split(",").map((part) => part.trim()));
};

const buildWebMetaDirectives = (options: MetaCspOptions = {}): Record<string, string[]> => {
  const connectSrc = uniqueHosts([
    "'self'",
    ...STRIPE_CSP_HOSTS.connectSrc,
    ...(options.connectSrcHosts ?? [])
  ]);
  const imgSrc = uniqueHosts(["'self'", "data:", "blob:", ...WEB_IMG_SRC_HOSTS, ...(options.imgSrcHosts ?? [])]);

  return {
    defaultSrc: ["'self'"],
    scriptSrc: uniqueHosts([
      "'self'",
      ...(options.strictScriptSrc ? [] : ["'unsafe-inline'"]),
      ...STRIPE_CSP_HOSTS.scriptSrc
    ]),
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc,
    connectSrc,
    frameSrc: ["'self'", ...STRIPE_CSP_HOSTS.frameSrc]
  };
};

/** CSP string for `<meta http-equiv="Content-Security-Policy" content="…">` (web SPA). */
export const metaContentSecurityPolicy = (options: MetaCspOptions = {}): string =>
  serializeCspDirectives(buildWebMetaDirectives(options));

/** CSP string for API HTTP headers when {@link shouldUseMetaCspOnly} is false. */
export const apiHttpContentSecurityPolicy = (): string => serializeCspDirectives(API_CSP_DIRECTIVES);

export type SecurityHeadersOptions = CspEnv & {
  /** When `http-header` mode, which CSP policy to attach. Default `api`. */
  surface?: "api" | "web";
  connectSrcHosts?: string[];
  imgSrcHosts?: string[];
};

/**
 * Safe HTTP response headers for production Node apps.
 * Omits `Content-Security-Policy` when {@link shouldUseMetaCspOnly} is true (Hostinger default).
 */
export const securityHeaders = (options: SecurityHeadersOptions = {}): Record<string, string> => {
  const nodeEnv = normalizeEnv(options.nodeEnv ?? process.env.NODE_ENV);
  const headers: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(),microphone=(),geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin"
  };

  if (nodeEnv === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  if (!shouldUseMetaCspOnly(options)) {
    const surface = options.surface ?? "api";
    headers["Content-Security-Policy"] =
      surface === "web"
        ? metaContentSecurityPolicy({
            connectSrcHosts: options.connectSrcHosts,
            imgSrcHosts: options.imgSrcHosts
          })
        : apiHttpContentSecurityPolicy();
  }

  return headers;
};

export const cspHttpHeaderBytes = (options: SecurityHeadersOptions = {}): number => {
  const csp = securityHeaders(options)["Content-Security-Policy"];
  return csp ? Buffer.byteLength(csp, "utf8") : 0;
};
