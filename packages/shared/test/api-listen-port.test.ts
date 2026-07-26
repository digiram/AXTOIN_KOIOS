/**
 * Tests for API listen port resolution.
 *
 * Asserts default port, valid `API_PORT` parsing, and invalid port fallback.
 *
 * Under test: `../src/api-listen-port.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_API_LISTEN_PORT, resolveApiListenPort } from "../src/api-listen-port.js";

describe("resolveApiListenPort", () => {
  it("defaults to DEFAULT_API_LISTEN_PORT when unset", () => {
    assert.equal(resolveApiListenPort(undefined), DEFAULT_API_LISTEN_PORT);
    assert.equal(resolveApiListenPort(""), DEFAULT_API_LISTEN_PORT);
  });

  it("parses API_PORT", () => {
    assert.equal(resolveApiListenPort("4001"), 4001);
  });

  it("ignores invalid API_PORT", () => {
    assert.equal(resolveApiListenPort("not-a-port"), DEFAULT_API_LISTEN_PORT);
  });
});
