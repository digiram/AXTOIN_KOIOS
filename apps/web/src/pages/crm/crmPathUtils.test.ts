/**
 * CrmPathUtilsTests.
 *
 * Unit tests for {@link crmBasePathForRole} role-to-prefix mapping.
 *
 * Responsibilities:
 * - Assert tenant admin, tenant user, and fallback roles resolve expected CRM prefixes
 */

import { describe, expect, it } from "vitest";

import { crmBasePathForRole } from "./crmPathUtils.js";

describe("crmBasePathForRole", () => {
  it("maps tenant_admin to /admin/crm", () => {
    expect(crmBasePathForRole("tenant_admin")).toBe("/admin/crm");
  });

  it("maps tenant_user to /user/crm", () => {
    expect(crmBasePathForRole("tenant_user")).toBe("/user/crm");
  });

  it("defaults non-admin roles to /user/crm", () => {
    expect(crmBasePathForRole("super_admin")).toBe("/user/crm");
  });
});
