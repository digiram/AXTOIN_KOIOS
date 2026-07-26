/**
 * Platform module settings patch — Sales CRM dependency in `src/platform-module-settings-repos.ts`.
 *
 * Asserts enabling Sales requires CRM and blocks invalid module combinations.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePlatformModuleSettingsPatch } from "../src/platform-module-settings-repos.js";

describe("platform module Sales CRM dependency", () => {
  it("clears Sales when CRM is disabled", () => {
    const resolved = resolvePlatformModuleSettingsPatch(
      { crmEnabled: false },
      {
        id: "x",
        crmEnabled: true,
        hrmEnabled: false,
        salesFunnelEnabled: true,
        companySubscriptionsEnabled: false,
        selfRegisterEnabled: true,
        mfaTotpEnabled: false,
        updatedAt: new Date()
      }
    );
    assert.equal(resolved.crmEnabled, false);
    assert.equal(resolved.salesFunnelEnabled, false);
  });

  it("throws when enabling Sales without CRM", () => {
    assert.throws(
      () =>
        resolvePlatformModuleSettingsPatch(
          { salesFunnelEnabled: true },
          {
            id: "x",
            crmEnabled: false,
            hrmEnabled: false,
            salesFunnelEnabled: false,
            companySubscriptionsEnabled: false,
            selfRegisterEnabled: true,
            mfaTotpEnabled: false,
            updatedAt: new Date()
          }
        ),
      /crm_required_for_sales/
    );
  });
});
