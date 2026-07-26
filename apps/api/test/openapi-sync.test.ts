/**
 * OpenAPI artifact drift guard — compares committed `openapi.json` to `buildOpenApiDocument`.
 *
 * Ensures route/schema changes update the checked-in OpenAPI file via `openapi:sync`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildOpenApiDocument } from "../src/openapi/build-document.js";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const committedPath = join(apiRoot, "openapi", "openapi.json");

describe("OpenAPI committed artifact", () => {
  it("matches buildOpenApiDocument() — run pnpm --filter @starter/api openapi:sync after route changes", () => {
    const committed = JSON.parse(readFileSync(committedPath, "utf8")) as unknown;
    const built = buildOpenApiDocument();
    assert.deepEqual(built, committed);
  });
});
