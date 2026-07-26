/**
 * Smoke test for AES-GCM encrypt/decrypt with tenant-scoped AAD.
 */

import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { decrypt, decryptBuffer, encrypt, encryptBuffer } from "../src/index.js";

describe("field encryption", () => {
  it("round trips with tenant context", () => {
    const key = randomBytes(32).toString("base64");
    const message = "sensitive-tax-id";
    const tenantId = "tenant-a";
    const encrypted = encrypt(message, key, { tenantId });
    const decrypted = decrypt(encrypted, key, { tenantId });
    assert.equal(decrypted, message);
  });

  it("does not produce ciphertext for empty or whitespace-only plaintext", () => {
    const key = randomBytes(32).toString("base64");
    assert.equal(encrypt("", key), "");
    assert.equal(encrypt("   ", key), "");
    assert.equal(decrypt("", key), "");
    assert.equal(decrypt("  ", key), "");
  });

  it("round trips binary buffers with tenant context", () => {
    const key = randomBytes(32).toString("base64");
    const tenantId = "tenant-a";
    const plain = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0xab, 0xcd]);
    const encrypted = encryptBuffer(plain, key, { tenantId });
    const decrypted = decryptBuffer(encrypted, key, { tenantId });
    assert.deepEqual(decrypted, plain);
  });
});
