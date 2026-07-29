/**
 * Tests for API and worker listen port resolution.
 *
 * Asserts default port, `API_PORT` / `PORT` precedence, worker optional port, and invalid fallback.
 *
 * Under test: `../src/api-listen-port.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_API_LISTEN_PORT,
  resolveApiListenPort,
  resolveWorkerHealthListenPort
} from "../src/api-listen-port.js";

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

  it("uses platform PORT when API_PORT is unset", () => {
    assert.equal(resolveApiListenPort(undefined, "3000"), 3000);
    assert.equal(resolveApiListenPort("", "3000"), 3000);
  });

  it("prefers API_PORT over platform PORT", () => {
    assert.equal(resolveApiListenPort("3500", "3000"), 3500);
  });

  it("ignores invalid platform PORT", () => {
    assert.equal(resolveApiListenPort(undefined, "nope"), DEFAULT_API_LISTEN_PORT);
  });
});

describe("resolveWorkerHealthListenPort", () => {
  it("returns null when both unset", () => {
    assert.equal(resolveWorkerHealthListenPort(undefined), null);
    assert.equal(resolveWorkerHealthListenPort(""), null);
    assert.equal(resolveWorkerHealthListenPort(undefined, ""), null);
  });

  it("parses WORKER_PORT", () => {
    assert.equal(resolveWorkerHealthListenPort("3600"), 3600);
  });

  it("uses platform PORT when WORKER_PORT is unset", () => {
    assert.equal(resolveWorkerHealthListenPort(undefined, "3000"), 3000);
  });

  it("prefers WORKER_PORT over platform PORT", () => {
    assert.equal(resolveWorkerHealthListenPort("3600", "3000"), 3600);
  });
});
