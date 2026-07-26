/**
 * Tests for envelope encryption, field cipher, blind indexes, DEK cache, and audit.
 */

import { randomBytes } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildContainsQueryHashes,
  buildEqualityQueryHash,
  buildSearchTokenSet,
  createWrappedTenantDek,
  decryptField,
  DekCache,
  encryptField,
  EnvKeyProvider,
  fuzzyMatchScore,
  generateNgrams,
  isFieldCipherEnvelope,
  logFieldDecrypt,
  normalizeSearchText,
  noopFieldDecryptAuditLogger,
  parseWrappedDek,
  deriveSearchIndexKeyFromKek,
  searchIndexKeyFromEnv,
  secureCompareTokenHash,
  storeWrappedDek,
  unwrapTenantDek
} from "../src/index.js";

const testKey = (): string => randomBytes(32).toString("base64");
const testSearchKey = (): string => randomBytes(32).toString("base64");

const fieldCtx = (overrides?: Partial<{ scopeId: string; table: string; field: string }>) => ({
  scopeId: overrides?.scopeId ?? "tenant-a",
  table: overrides?.table ?? "crm_contacts",
  field: overrides?.field ?? "firstName"
});

describe("envelope encryption", () => {
  it("wraps and unwraps tenant DEK", () => {
    const kek = testKey();
    const provider = new EnvKeyProvider({ kekBase64: kek });
    const { plainDek, wrapped } = createWrappedTenantDek(provider);
    assert.equal(plainDek.byteLength, 32);
    const stored = storeWrappedDek(wrapped);
    const parsed = parseWrappedDek(stored);
    const { dek } = unwrapTenantDek(stored, provider);
    assert.deepEqual(dek, plainDek);
    assert.equal(parsed.keyVersion, provider.getActiveKekVersion());
  });

  it("fails unwrap with wrong KEK", () => {
    const provider = new EnvKeyProvider({ kekBase64: testKey() });
    const { wrapped } = createWrappedTenantDek(provider);
    const wrongProvider = new EnvKeyProvider({ kekBase64: testKey() });
    assert.throws(() => unwrapTenantDek(storeWrappedDek(wrapped), wrongProvider));
  });
});

describe("field cipher", () => {
  it("encrypts and decrypts with AAD binding", () => {
    const dek = randomBytes(32);
    const ctx = fieldCtx();
    const encrypted = encryptField("John", dek, ctx, 1);
    assert.ok(isFieldCipherEnvelope(encrypted));
    const decrypted = decryptField(encrypted, dek, ctx);
    assert.equal(decrypted, "John");
  });

  it("rejects AAD swap across fields", () => {
    const dek = randomBytes(32);
    const encrypted = encryptField("secret", dek, fieldCtx({ field: "firstName" }), 1);
    assert.throws(() =>
      decryptField(encrypted, dek, fieldCtx({ field: "lastName" }))
    );
  });

  it("rejects AAD swap across tenants", () => {
    const dek = randomBytes(32);
    const encrypted = encryptField("secret", dek, fieldCtx({ scopeId: "tenant-a" }), 1);
    assert.throws(() =>
      decryptField(encrypted, dek, fieldCtx({ scopeId: "tenant-b" }))
    );
  });

  it("rejects tampered auth tag", () => {
    const dek = randomBytes(32);
    const ctx = fieldCtx();
    let encrypted = encryptField("tamper", dek, ctx, 1);
    encrypted = encrypted.replace(/.$/, encrypted.endsWith("A") ? "B" : "A");
    assert.throws(() => decryptField(encrypted, dek, ctx));
  });

  it("returns empty for blank plaintext", () => {
    const dek = randomBytes(32);
    assert.equal(encryptField("  ", dek, fieldCtx(), 1), "");
    assert.equal(decryptField("", dek, fieldCtx()), "");
  });

  it("uses unique IVs per encryption", () => {
    const dek = randomBytes(32);
    const ctx = fieldCtx();
    const a = encryptField("same", dek, ctx, 1);
    const b = encryptField("same", dek, ctx, 1);
    assert.notEqual(a, b);
  });
});

describe("blind index", () => {
  it("normalizes accents and case", () => {
    assert.equal(normalizeSearchText("  José  "), "jose");
    assert.equal(normalizeSearchText("CAFÉ"), "cafe");
  });

  it("generates n-grams", () => {
    const grams = generateNgrams("hello", 3);
    assert.ok(grams.includes("hel"));
    assert.ok(grams.includes("llo"));
  });

  it("produces stable hashes for equality search", () => {
    const searchKey = testSearchKey();
    const ctx = { tenantId: "t1", table: "crm_contacts", field: "email" };
    const set = buildSearchTokenSet("User@Example.com", ctx, searchKey);
    assert.ok(set.equalityHash);
    const queryHash = buildEqualityQueryHash("user@example.com", ctx, searchKey);
    assert.equal(set.equalityHash, queryHash);
  });

  it("isolates tokens by tenant", () => {
    const searchKey = testSearchKey();
    const a = buildSearchTokenSet("John", { tenantId: "t1", table: "crm_contacts", field: "firstName" }, searchKey);
    const b = buildSearchTokenSet("John", { tenantId: "t2", table: "crm_contacts", field: "firstName" }, searchKey);
    assert.notDeepEqual(a.ngramHashes, b.ngramHashes);
  });

  it("supports contains query tokenization", () => {
    const searchKey = testSearchKey();
    const ctx = { tenantId: "t1", table: "crm_contacts", field: "firstName" };
    const stored = buildSearchTokenSet("Jonathan", ctx, searchKey);
    const query = buildContainsQueryHashes("nathan", ctx, searchKey);
    const score = fuzzyMatchScore(query, stored.ngramHashes);
    assert.ok(score > 0);
  });

  it("compares token hashes in constant time", () => {
    const h = randomBytes(32).toString("hex");
    assert.ok(secureCompareTokenHash(h, h));
    assert.equal(secureCompareTokenHash(h, randomBytes(32).toString("hex")), false);
  });
});

describe("DEK cache", () => {
  afterEach(() => {
    // no global state
  });

  it("stores and retrieves DEK", () => {
    const cache = new DekCache({ ttlMs: 60_000, maxEntries: 10 });
    const dek = randomBytes(32);
    cache.set("tenant-1", dek, 1);
    const entry = cache.get("tenant-1");
    assert.ok(entry);
    assert.deepEqual(entry.dek, dek);
    assert.equal(entry.dekKeyVersion, 1);
  });

  it("evicts after TTL", async () => {
    const cache = new DekCache({ ttlMs: 20, maxEntries: 10 });
    cache.set("tenant-1", randomBytes(32), 1);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(cache.get("tenant-1"), undefined);
  });

  it("evicts LRU when over capacity", () => {
    const cache = new DekCache({ ttlMs: 60_000, maxEntries: 2 });
    cache.set("a", randomBytes(32), 1);
    cache.set("b", randomBytes(32), 1);
    cache.set("c", randomBytes(32), 1);
    assert.equal(cache.get("a"), undefined);
    assert.ok(cache.get("b"));
    assert.ok(cache.get("c"));
  });
});

describe("search index key derivation", () => {
  const kek = (): string => randomBytes(32).toString("base64");

  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.SEARCH_INDEX_KEY;
  });

  it("derives a stable subkey from FIELD_ENCRYPTION_KEY", () => {
    const key = kek();
    const a = deriveSearchIndexKeyFromKek(key);
    const b = deriveSearchIndexKeyFromKek(key);
    assert.equal(a, b);
    assert.notEqual(a, key);
  });

  it("searchIndexKeyFromEnv uses explicit SEARCH_INDEX_KEY when set", () => {
    const explicit = kek();
    process.env.FIELD_ENCRYPTION_KEY = kek();
    process.env.SEARCH_INDEX_KEY = explicit;
    assert.equal(searchIndexKeyFromEnv(), explicit);
  });

  it("searchIndexKeyFromEnv derives from FIELD_ENCRYPTION_KEY when override unset", () => {
    const fieldKey = kek();
    process.env.FIELD_ENCRYPTION_KEY = fieldKey;
    assert.equal(searchIndexKeyFromEnv(), deriveSearchIndexKeyFromKek(fieldKey));
  });
});

describe("audit", () => {
  it("logs decrypt events without plaintext", () => {
    const events: unknown[] = [];
    const logger = {
      info: (event: unknown) => events.push(event)
    };
    logFieldDecrypt(logger, {
      tenantId: "t1",
      entityTable: "crm_contacts",
      entityId: "id-1",
      field: "firstName",
      userId: "u1",
      traceId: "trace-1"
    });
    assert.equal(events.length, 1);
    const ev = events[0] as Record<string, unknown>;
    assert.equal(ev.event, "field_decrypt");
    assert.equal(ev.field, "firstName");
    assert.equal(ev.tenantId, "t1");
    assert.ok(!("plaintext" in ev));
    assert.ok(!("key" in ev));
  });

  it("noop logger does not throw", () => {
    logFieldDecrypt(noopFieldDecryptAuditLogger, {
      tenantId: null,
      entityTable: "users",
      entityId: "x",
      field: "email"
    });
  });
});
