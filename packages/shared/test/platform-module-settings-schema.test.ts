/**
 * Tests for platform module enablement settings schemas.
 *
 * Under test: `../src/platform-integrations.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { platformModuleSettingsPutBodySchema } from "../src/platform-integrations.js";

describe("platformModuleSettingsPutBodySchema", () => {
  it("rejects empty body", () => {
    assert.equal(platformModuleSettingsPutBodySchema.safeParse({}).success, false);
  });

  it("accepts crmEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ crmEnabled: false });
    assert.equal(r.success, true);
  });

  it("accepts selfRegisterEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ selfRegisterEnabled: false });
    assert.equal(r.success, true);
  });

  it("accepts both flags", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ crmEnabled: true, selfRegisterEnabled: false });
    assert.equal(r.success, true);
  });

  it("accepts mfaTotpEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ mfaTotpEnabled: true });
    assert.equal(r.success, true);
  });

  it("accepts hrmEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ hrmEnabled: true });
    assert.equal(r.success, true);
  });

  it("accepts salesFunnelEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ salesFunnelEnabled: true });
    assert.equal(r.success, true);
  });

  it("accepts companySubscriptionsEnabled only", () => {
    const r = platformModuleSettingsPutBodySchema.safeParse({ companySubscriptionsEnabled: true });
    assert.equal(r.success, true);
  });
});
