/**
 * Image MIME sniffing — `src/lib/image-magic-bytes.ts`.
 *
 * Asserts magic-byte detection and buffer/MIME consistency checks.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertImageMimeMatchesBuffer, detectImageMimeFromBuffer } from "../src/lib/image-magic-bytes.js";

describe("image magic bytes", () => {
  it("detects PNG and rejects MIME mismatch", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    assert.equal(detectImageMimeFromBuffer(png), "image/png");
    assert.doesNotThrow(() => assertImageMimeMatchesBuffer(png, "image/png"));
    assert.throws(() => assertImageMimeMatchesBuffer(png, "image/jpeg"));
  });
});
