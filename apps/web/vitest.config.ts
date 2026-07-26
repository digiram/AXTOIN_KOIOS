/**
 * Vitest configuration for the web workspace.
 *
 * Responsibilities:
 * - Run unit tests matching src glob patterns for .test.ts and .test.tsx in Node
 * - Resolve @starter/shared to the workspace package entry for contract tests
 *
 * Related:
 * - Root pnpm verify includes web typecheck; run pnpm --filter @starter/web test for Vitest
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@starter/shared": path.resolve(dir, "../../packages/shared/src/index.ts")
    }
  }
});
