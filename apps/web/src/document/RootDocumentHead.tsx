/**
 * Root document security — meta CSP for Hostinger / LiteSpeed production deploys.
 *
 * In meta-only mode the CSP is injected into `apps/web/index.html` at build time (see `vite.config.ts`)
 * so it appears in `<head>` before the module script. This component mirrors the same policy for React 19
 * metadata hoisting when the HTML shell is rendered dynamically (e.g. future SSR); it is a no-op when the
 * build already injected the tag (`VITE_CSP_META_IN_HTML`).
 */

import {
  metaContentSecurityPolicy,
  parseCommaSeparatedHosts,
  hostnameFromOrigin
} from "@starter/shared";

const buildMetaCspContent = (): string => {
  const apiHost = hostnameFromOrigin(import.meta.env.VITE_API_BASE_URL);
  const connectSrcHosts = [
    ...(apiHost ? [apiHost] : []),
    ...parseCommaSeparatedHosts(import.meta.env.VITE_CSP_CONNECT_SRC_EXTRA)
  ];
  const imgSrcHosts = parseCommaSeparatedHosts(import.meta.env.VITE_CSP_IMG_SRC_EXTRA);
  return metaContentSecurityPolicy({
    connectSrcHosts,
    imgSrcHosts,
    strictScriptSrc: import.meta.env.PROD
  });
};

export const rootDocumentMetaCspContent = (): string | undefined => {
  if (import.meta.env.VITE_CSP_META_ONLY !== "true") return undefined;
  if (import.meta.env.VITE_CSP_META_IN_HTML === "true") return undefined;
  return buildMetaCspContent();
};

export function RootDocumentHead() {
  const content = rootDocumentMetaCspContent();
  if (!content) return null;
  return <meta httpEquiv="Content-Security-Policy" content={content} />;
}

/** HTML snippet for Vite `transformIndexHtml` — keeps meta CSP as early as possible in `<head>`. */
export const buildMetaCspHtmlTag = (csp: string): string =>
  `<meta http-equiv="Content-Security-Policy" content="${csp.replaceAll('"', "&quot;")}">`;

export const resolveWebMetaCspContent = (env: {
  nodeEnv: string;
  cspInMeta?: string;
  apiBaseUrl?: string;
  connectSrcExtra?: string;
  imgSrcExtra?: string;
}): string | undefined => {
  const production = env.nodeEnv.trim().toLowerCase() === "production";
  const cspInMeta = (env.cspInMeta ?? "").trim().toLowerCase();
  const metaOnly =
    production && cspInMeta !== "off" && cspInMeta !== "false" && cspInMeta !== "0";
  if (!metaOnly) return undefined;

  const apiHost = hostnameFromOrigin(env.apiBaseUrl);
  const connectSrcHosts = [
    ...(apiHost ? [apiHost] : []),
    ...parseCommaSeparatedHosts(env.connectSrcExtra)
  ];
  const imgSrcHosts = parseCommaSeparatedHosts(env.imgSrcExtra);
  return metaContentSecurityPolicy({ connectSrcHosts, imgSrcHosts, strictScriptSrc: true });
};
