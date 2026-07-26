/**
 * Tests for tenant module role keys and permission matrix mapping.
 *
 * Under test: `../src/module-roles.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyModulePermissionToggle,
  applyUiPermissionToggle,
  modulePermissionAllowed,
  moduleRoleToPermissionFlags,
  moduleRoleToUiPermissionFlags,
  parseModuleRolesClaim,
  permissionFlagsToModuleRole,
  permissionMatrixToModuleRolesMap,
  resolveModuleRole,
  serializeModuleRolesClaim,
  storageFlagsToUi,
  tenantUserModuleRolesPatchSchema,
  uiPermissionFlagsToModuleRole,
  uiToStorageFlags
} from "../src/module-roles.js";

describe("module roles", () => {
  it("tenant admin resolves to manager on any module", () => {
    assert.equal(resolveModuleRole("sales", "tenant_admin", {}), "manager");
    assert.equal(resolveModuleRole("crm", "tenant_admin", {}), "manager");
  });

  it("member without assignment has no module role", () => {
    assert.equal(resolveModuleRole("workforce", "tenant_user", {}), null);
  });

  it("maps permissions by role", () => {
    assert.equal(modulePermissionAllowed("manager", "delete"), true);
    assert.equal(modulePermissionAllowed("user", "delete"), false);
    assert.equal(modulePermissionAllowed("user", "write"), true);
    assert.equal(modulePermissionAllowed("viewer", "write"), false);
    assert.equal(modulePermissionAllowed("viewer", "read"), true);
  });

  it("parses and serializes multi-module JWT mr claim", () => {
    const raw = serializeModuleRolesClaim({ crm: "manager", sales: "viewer", workforce: "user" });
    assert.equal(raw, '{"crm":"manager","sales":"viewer","workforce":"user"}');
    assert.deepEqual(parseModuleRolesClaim(raw), {
      crm: "manager",
      sales: "viewer",
      workforce: "user"
    });
  });

  it("validates patch body for all modules", () => {
    const ok = tenantUserModuleRolesPatchSchema.safeParse({
      crm: "manager",
      sales: null,
      workforce: "viewer"
    });
    assert.equal(ok.success, true);
  });

  it("maps permission flags to roles and enforces hierarchy on toggle", () => {
    assert.deepEqual(moduleRoleToPermissionFlags("manager"), { read: true, write: true, delete: true });
    assert.deepEqual(moduleRoleToPermissionFlags("user"), { read: true, write: true, delete: false });
    assert.deepEqual(moduleRoleToPermissionFlags("viewer"), { read: true, write: false, delete: false });
    assert.equal(permissionFlagsToModuleRole({ read: true, write: true, delete: true }), "manager");
    assert.equal(permissionFlagsToModuleRole({ read: true, write: true, delete: false }), "user");
    assert.equal(permissionFlagsToModuleRole({ read: true, write: false, delete: false }), "viewer");
    assert.equal(permissionFlagsToModuleRole({ read: false, write: false, delete: false }), null);

    const afterDelete = applyModulePermissionToggle(
      { read: false, write: false, delete: false },
      "delete",
      true
    );
    assert.deepEqual(afterDelete, { read: true, write: true, delete: true });

    const afterClearRead = applyModulePermissionToggle(
      { read: true, write: true, delete: true },
      "read",
      false
    );
    assert.deepEqual(afterClearRead, { read: false, write: false, delete: false });
  });

  it("round-trips permission matrix to module roles map", () => {
    const matrix = {
      crm: { read: true, write: true, delete: true },
      sales: { read: true, write: false, delete: false },
      workforce: { read: true, write: true, delete: false },
      company_subscriptions: { read: false, write: false, delete: false },
      invoicing: { read: false, write: false, delete: false },
      mailbox: { read: false, write: false, delete: false }
    } as const;
    assert.deepEqual(permissionMatrixToModuleRolesMap(matrix), {
      crm: "manager",
      sales: "viewer",
      workforce: "user"
    });
  });

  it("maps UI View/Add/Edit/Delete to storage flags and roles", () => {
    assert.deepEqual(storageFlagsToUi({ read: true, write: true, delete: false }), {
      view: true,
      add: true,
      edit: true,
      delete: false
    });
    assert.deepEqual(uiToStorageFlags({ view: true, add: false, edit: true, delete: false }), {
      read: true,
      write: true,
      delete: false
    });
    assert.equal(uiPermissionFlagsToModuleRole({ view: true, add: true, edit: false, delete: false }), "user");
    assert.equal(moduleRoleToUiPermissionFlags("manager").delete, true);

    const afterDelete = applyUiPermissionToggle(
      { view: false, add: false, edit: false, delete: false },
      "delete",
      true
    );
    assert.deepEqual(afterDelete, { view: true, add: true, edit: true, delete: true });
  });
});
