/**
 * Vite bundler config for the React SPA (`apps/web`).
 *
 * Workspace alias: `@starter/shared`'s package.json points at `dist/` for Node consumers; Vite's prod
 * bundle resolves the workspace package by manifest before TS path mappings. Aliasing to `src`
 * avoids requiring `pnpm --filter @starter/shared build` before every `vite build`.
 *
 * **Local API wiring**
 * - Root `.env` **`API_PORT`** is the Fastify listen port. It must match
 *   what `@starter/api` binds (`apps/api/src/index.ts` + `packages/shared/src/api-listen-port.ts`).
 * - **Development, no `VITE_API_BASE_URL`:** the SPA uses **same-origin** requests (`VITE_API_BASE_URL` is `""`) and
 *   Vite **proxies** the prefixes in `dev-api-proxy-paths.ts` to `http://127.0.0.1:<API_PORT>` (see Vite startup log).
 *   That way the **browser** does not open a second port; Vite forwards in Node. If the API is not running, the **Vite
 *   terminal** may still log `ECONNREFUSED` to that address until you start `@starter/api` (see proxy `configure`
 *   below for a throttled hint).
 * - **Explicit `VITE_API_BASE_URL`:** proxy is disabled; the bundle keeps cross-origin fetches (Docker, split hosts).
 * - **Production builds:** unchanged default `http://localhost:<API_PORT>` when unset (set `VITE_API_BASE_URL` at build time for real deploys).
 */

import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
/**
 * Vite pre-bundles `vite.config.ts` with esbuild before `resolve.alias` applies. Import small workspace **src**
 * modules via relative paths (not `@starter/*`, which often resolves to missing or stale `dist/`).
 */
import { resolveApiListenPort } from "../../packages/shared/src/api-listen-port.js";
import { printDevServiceReady } from "../../packages/logger/src/dev-terminal-banner.js";
import { markDevProcessReady } from "../../scripts/dev-process-registry.mjs";

import {
  buildMetaCspHtmlTag,
  resolveWebMetaCspContent
} from "./src/document/RootDocumentHead";
import { devApiProxyPathRegex } from "./dev-api-proxy-paths";

function starterWebDevReadyPlugin(opts: {
  mode: string;
  useDevApiProxy: boolean;
  apiTarget: string;
  explicitApi: string;
  port: string;
}): Plugin {
  const bootAt = Date.now();
  return {
    name: "starter-web-dev-ready",
    apply: "serve",
    configureServer(server) {
      if (opts.mode !== "development") return;
      server.httpServer?.once("listening", () => {
        const addr = server.httpServer?.address();
        const configuredPort = server.config.server.port ?? 5173;
        let localUrl = `http://localhost:${configuredPort}/`;
        if (addr && typeof addr === "object") {
          const p = addr.port;
          const host = addr.address === "::" || addr.address === "::1" ? "localhost" : addr.address;
          localUrl = `http://${host}:${String(p)}/`;
        }
        const lines: { label: string; value: string }[] = [{ label: "Local", value: localUrl }];
        if (opts.useDevApiProxy) {
          lines.push({ label: "API proxy", value: `${opts.apiTarget}/` });
        } else if (opts.explicitApi) {
          lines.push({ label: "API", value: opts.explicitApi });
        } else {
          lines.push({ label: "API (build default)", value: `http://localhost:${opts.port}/` });
        }
        printDevServiceReady("@starter/web", Date.now() - bootAt, lines);
        const listenPort =
          addr && typeof addr === "object" && addr.port ? addr.port : configuredPort;
        markDevProcessReady({ pid: process.pid, port: listenPort });
      });
    }
  };
}

function metaCspIndexHtmlPlugin(opts: {
  mode: string;
  nodeEnv: string;
  cspInMeta: string;
  apiBaseUrl: string;
  connectSrcExtra: string;
  imgSrcExtra: string;
}): Plugin {
  return {
    name: "starter-web-meta-csp",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const csp = resolveWebMetaCspContent({
          nodeEnv: opts.nodeEnv || (opts.mode === "production" ? "production" : "development"),
          cspInMeta: opts.cspInMeta,
          apiBaseUrl: opts.apiBaseUrl,
          connectSrcExtra: opts.connectSrcExtra,
          imgSrcExtra: opts.imgSrcExtra
        });
        if (!csp) return html;
        const tag = buildMetaCspHtmlTag(csp);
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    ${tag}`
        );
      }
    }
  };
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "../..");

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, repoRoot, "");
  const portNum = resolveApiListenPort(loaded.API_PORT, loaded.PORT);
  const port = String(portNum);
  const explicitApi = (loaded.VITE_API_BASE_URL || "").trim();
  const useDevApiProxy = mode === "development" && !explicitApi;
  const apiBase = explicitApi || (useDevApiProxy ? "" : `http://localhost:${port}`);
  const apiTarget = `http://127.0.0.1:${port}`;
  const refreshTokenInCookie =
    mode === "production"
      ? loaded.VITE_REFRESH_TOKEN_IN_COOKIE !== "false"
      : loaded.VITE_REFRESH_TOKEN_IN_COOKIE === "true" || loaded.VITE_REFRESH_TOKEN_IN_COOKIE === "1";
  const nodeEnv = (loaded.NODE_ENV || (mode === "production" ? "production" : "development")).trim();
  const cspInMeta = (loaded.CSP_IN_META || "").trim();
  const metaCspContent = resolveWebMetaCspContent({
    nodeEnv,
    cspInMeta,
    apiBaseUrl: apiBase,
    connectSrcExtra: loaded.VITE_CSP_CONNECT_SRC_EXTRA,
    imgSrcExtra: loaded.VITE_CSP_IMG_SRC_EXTRA
  });
  const cspMetaOnly = metaCspContent !== undefined;

  let lastApiProxyHintMs = 0;
  const onApiProxyError = (err: unknown, _req: unknown, res: unknown) => {
    const now = Date.now();
    if (now - lastApiProxyHintMs > 8000) {
      lastApiProxyHintMs = now;
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(
        `\n[vite] API proxy → ${apiTarget} (${detail}). Start the API from the repo root: pnpm dev   (or pnpm dev:all)\n`
      );
    }
    if (
      res &&
      typeof res === "object" &&
      "writeHead" in res &&
      typeof (res as ServerResponse).writeHead === "function"
    ) {
      const out = res as ServerResponse;
      if (!out.headersSent) {
        out.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        out.end(
          `Bad Gateway — nothing is listening at ${apiTarget}. From repo root run pnpm dev (API) or pnpm dev:all (web+API+worker). Align root .env API_PORT with the API.`
        );
      }
    }
  };

  return {
    envDir: repoRoot,
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase),
      "import.meta.env.VITE_REFRESH_TOKEN_IN_COOKIE": JSON.stringify(refreshTokenInCookie ? "true" : ""),
      "import.meta.env.VITE_CSP_META_ONLY": JSON.stringify(cspMetaOnly ? "true" : ""),
      "import.meta.env.VITE_CSP_META_IN_HTML": JSON.stringify(cspMetaOnly ? "true" : ""),
      "import.meta.env.VITE_CSP_META_CONTENT": JSON.stringify(metaCspContent ?? ""),
      "import.meta.env.VITE_CSP_CONNECT_SRC_EXTRA": JSON.stringify(loaded.VITE_CSP_CONNECT_SRC_EXTRA ?? ""),
      "import.meta.env.VITE_CSP_IMG_SRC_EXTRA": JSON.stringify(loaded.VITE_CSP_IMG_SRC_EXTRA ?? "")
    },
    plugins: [
      react(),
      metaCspIndexHtmlPlugin({
        mode,
        nodeEnv,
        cspInMeta,
        apiBaseUrl: apiBase,
        connectSrcExtra: loaded.VITE_CSP_CONNECT_SRC_EXTRA ?? "",
        imgSrcExtra: loaded.VITE_CSP_IMG_SRC_EXTRA ?? ""
      }),
      starterWebDevReadyPlugin({ mode, useDevApiProxy, apiTarget, explicitApi, port })
    ],
    resolve: {
      alias: {
        "@starter/shared": path.resolve(dir, "../../packages/shared/src/index.ts")
      }
    },
    server: useDevApiProxy
      ? {
          proxy: {
            [devApiProxyPathRegex]: {
              target: apiTarget,
              changeOrigin: true,
              ws: true,
              configure: (proxy) => {
                proxy.on("error", onApiProxyError);
              }
            }
          }
        }
      : undefined
  };
});
