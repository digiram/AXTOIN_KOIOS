/**
 * Writes `openapi/openapi.json` from the same builder used at runtime (`buildOpenApiDocument`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildOpenApiDocument } from "../src/openapi/build-document.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "openapi", "openapi.json");

const document = buildOpenApiDocument();
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
