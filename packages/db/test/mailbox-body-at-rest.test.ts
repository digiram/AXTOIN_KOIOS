/**
 * Mailbox body field encryption — `src/mailbox-body-at-rest.ts`.
 *
 * Asserts encrypt/decrypt round-trip for message bodies at rest.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { decryptField, encryptField } from "@starter/crypto";

import { encryptMailboxBodiesAtRest } from "../src/mailbox-body-at-rest.js";
import { resetFieldEncryptionMiddlewareForTests } from "../src/field-encryption/middleware.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const MESSAGE = "00000000-0000-4000-8000-000000000099";

describe("mailbox body at rest", () => {
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    resetFieldEncryptionMiddlewareForTests();
  });

  it("uses mailbox_messages bodyText/bodyHtml AAD binding", () => {
    const dek = Buffer.alloc(32, 3);
    const plain = "<p>Hello mailbox</p>";
    const ctx = { scopeId: TENANT, table: "mailbox_messages", field: "bodyText" };
    const stored = encryptField(plain, dek, ctx, 1);
    assert.ok(stored.startsWith("SFENC1:"));
    assert.equal(decryptField(stored, dek, ctx), plain);
  });

  it("stores plaintext when key is unset", async () => {
    const plain = "no key";
    const stored = await encryptMailboxBodiesAtRest(TENANT, MESSAGE, {
      bodyText: plain,
      bodyHtml: null
    });
    assert.equal(stored.bodyText, plain);
  });
});
