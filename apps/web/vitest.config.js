/**
 * Vitest configuration for the web workspace (compiled JS mirror of vitest.config.ts).
 *
 * Responsibilities:
 * - Run unit tests matching src glob patterns for .test.ts and .test.tsx in Node
 * - Resolve @starter/shared to the workspace package entry
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
//# sourceMappingURL=vitest.config.js.map