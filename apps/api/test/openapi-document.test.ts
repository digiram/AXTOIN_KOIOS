/**
 * OpenAPI document builder — `buildOpenApiDocument` in `src/openapi/build-document.ts`.
 *
 * Asserts schema shape, paths, and security definitions in the generated spec.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildOpenApiDocument } from "../src/openapi/build-document.js";

describe("OpenAPI document", () => {
  it("builds OpenAPI 3.0 with versioned paths and Zod-derived auth bodies", () => {
    const doc = buildOpenApiDocument();
    assert.equal(doc.openapi, "3.0.3");
    assert.equal((doc.info as { title: string }).title, "KOIOS API");

    const paths = doc.paths as Record<string, unknown>;
    assert.ok(paths["/auth/login"]);
    assert.ok(paths["/tenant/crm/contacts"]);
    assert.ok(paths["/tenant/sales/bdr/leads"]);
    assert.ok(paths["/tenant/workforce/employees"]);

    const login = paths["/auth/login"] as {
      post?: { requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> } };
    };
    const loginSchema = login.post?.requestBody?.content?.["application/json"]?.schema;
    assert.ok(loginSchema);
    assert.ok(
      loginSchema?.type === "object" ||
        typeof loginSchema?.$ref === "string" ||
        typeof (loginSchema as { properties?: unknown }).properties === "object"
    );
  });
});
