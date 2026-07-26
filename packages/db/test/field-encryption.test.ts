/**
 * Field encryption unit tests (no database).
 */

import { randomBytes } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EnvKeyProvider,
  createWrappedTenantDek,
  encryptField,
  decryptField,
  hasNestedFieldCipherEnvelope,
  isFieldCipherEnvelope,
  storeWrappedDek,
  unwrapFieldCipherEnvelope
} from "@starter/crypto";

import { searchableFieldsForTable, sensitiveFieldsForTable } from "../src/field-encryption/registry.js";
import { resetFieldEncryptionMiddlewareForTests } from "../src/field-encryption/middleware.js";

describe("field encryption registry", () => {
  afterEach(() => {
    resetFieldEncryptionMiddlewareForTests();
  });

  it("registers crm_contacts searchable fields", () => {
    const fields = searchableFieldsForTable("crm_contacts");
    assert.ok(fields.includes("firstName"));
    assert.ok(fields.includes("email"));
    assert.ok(fields.includes("city"));
  });

  it("registers CRM and user tables", () => {
    assert.ok(searchableFieldsForTable("crm_organizations").includes("name"));
    assert.ok(searchableFieldsForTable("crm_activities").includes("title"));
    assert.ok(searchableFieldsForTable("users").includes("displayName"));
  });

  it("registers workforce and invoicing tables", () => {
    assert.ok(searchableFieldsForTable("workforce_employees").includes("firstName"));
    assert.ok(searchableFieldsForTable("workforce_org_units").includes("name"));
    assert.ok(sensitiveFieldsForTable("workforce_employee_socials").includes("profileUrl"));
    assert.ok(sensitiveFieldsForTable("invoicing_quotes").includes("customerSnapshotJson"));
    assert.ok(sensitiveFieldsForTable("invoicing_tenant_configuration").includes("defaultFooterText"));
  });

  it("registers mailbox tables", () => {
    assert.ok(searchableFieldsForTable("mailbox_threads").includes("subjectNormalized"));
    assert.ok(sensitiveFieldsForTable("mailbox_accounts").includes("emailAddress"));
    assert.ok(sensitiveFieldsForTable("mailbox_messages").includes("headersJson"));
  });

  it("registers secret and blob tables", () => {
    assert.ok(sensitiveFieldsForTable("mailbox_accounts").includes("oauthAccessTokenEncrypted"));
    assert.ok(sensitiveFieldsForTable("tenant_smtp_settings").includes("passwordEncrypted"));
    assert.ok(sensitiveFieldsForTable("platform_payment_settings").includes("stripeSecretEncrypted"));
    assert.ok(sensitiveFieldsForTable("mailbox_messages").includes("bodyText"));
    assert.ok(sensitiveFieldsForTable("tenant_blob_payload").includes("data"));
  });

  it("registers user MFA and tax id secrets", () => {
    assert.ok(sensitiveFieldsForTable("users").includes("mfaTotpSecretEncrypted"));
    assert.ok(sensitiveFieldsForTable("users").includes("encryptedTaxId"));
  });

  it("registers phase 4 tables and fields", () => {
    assert.ok(sensitiveFieldsForTable("tenants").includes("name"));
    assert.ok(searchableFieldsForTable("tenants").includes("name"));
    assert.ok(sensitiveFieldsForTable("mailbox_messages").includes("fromJson"));
    assert.ok(sensitiveFieldsForTable("mailbox_messages").includes("toJson"));
    assert.ok(sensitiveFieldsForTable("company_subscription_seats").includes("email"));
    assert.ok(sensitiveFieldsForTable("invoicing_audit_events").includes("payloadJson"));
    assert.ok(sensitiveFieldsForTable("platform_smtp_settings").includes("host"));
    assert.ok(sensitiveFieldsForTable("platform_smtp_settings").includes("username"));
    assert.ok(searchableFieldsForTable("sales_funnel_bdr_leads").includes("title"));
    assert.ok(searchableFieldsForTable("sales_funnel_sales_deals").includes("description"));
  });
});

describe("tenant DEK envelope", () => {
  it("creates unique wrapped DEKs per wrap", () => {
    const provider = new EnvKeyProvider({ kekBase64: Buffer.alloc(32, 1).toString("base64") });
    const a = storeWrappedDek(createWrappedTenantDek(provider).wrapped);
    const b = storeWrappedDek(createWrappedTenantDek(provider).wrapped);
    assert.notEqual(a, b);
  });
});

describe("field cipher AAD (crm_contacts pilot)", () => {
  it("round-trips with tenant/table/field binding", () => {
    const dek = randomBytes(32);
    const tenantId = randomBytes(16).toString("hex");
    const ctx = { scopeId: tenantId, table: "crm_contacts", field: "firstName" };
    const enc = encryptField("Alice", dek, ctx, 1);
    assert.ok(isFieldCipherEnvelope(enc));
    assert.equal(decryptField(enc, dek, ctx), "Alice");
  });

  it("rejects cross-field replay", () => {
    const dek = randomBytes(32);
    const tenantId = randomBytes(16).toString("hex");
    const enc = encryptField("secret", dek, { scopeId: tenantId, table: "crm_contacts", field: "firstName" }, 1);
    assert.throws(() =>
      decryptField(enc, dek, { scopeId: tenantId, table: "crm_contacts", field: "lastName" })
    );
  });

  it("unwraps accidentally nested SFENC1 envelopes", () => {
    const dek = randomBytes(32);
    const tenantId = randomBytes(16).toString("hex");
    const ctx = { scopeId: tenantId, table: "mailbox_accounts", field: "displayName" };
    const inner = encryptField("Gmail user", dek, ctx, 1);
    const outer = encryptField(inner, dek, ctx, 1);
    assert.equal(unwrapFieldCipherEnvelope(outer, dek, ctx), "Gmail user");
  });

  it("detects nested envelopes without flagging single-layer ciphertext", () => {
    const dek = randomBytes(32);
    const tenantId = randomBytes(16).toString("hex");
    const ctx = { scopeId: tenantId, table: "crm_contacts", field: "firstName" };
    const single = encryptField("Alice", dek, ctx, 1);
    const nested = encryptField(single, dek, ctx, 1);
    assert.equal(hasNestedFieldCipherEnvelope(single, dek, ctx), false);
    assert.equal(hasNestedFieldCipherEnvelope(nested, dek, ctx), true);
  });
});
