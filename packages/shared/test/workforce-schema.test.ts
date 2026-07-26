/**
 * Tests for workforce module request and query schemas.
 *
 * Under test: `../src/workforce.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  workforceEmployeeCreateSchema,
  workforceEmployeePatchSchema,
  workforceEmployeesListQuerySchema,
  workforceOrgUnitCreateSchema,
  workforceOrgUnitPatchSchema
} from "../src/workforce.js";

describe("workforce schemas", () => {
  it("org create accepts optional parent and assignee", () => {
    const a = workforceOrgUnitCreateSchema.safeParse({ name: "HQ" });
    assert.equal(a.success, true);
    const b = workforceOrgUnitCreateSchema.safeParse({
      name: "East",
      parentOrgUnitId: "00000000-0000-4000-8000-000000000001",
      assignedEmployeeId: "00000000-0000-4000-8000-000000000002"
    });
    assert.equal(b.success, true);
  });

  it("org patch rejects empty object", () => {
    assert.equal(workforceOrgUnitPatchSchema.safeParse({}).success, false);
  });

  it("org patch accepts onOrgChart only", () => {
    const r = workforceOrgUnitPatchSchema.safeParse({ onOrgChart: false });
    assert.equal(r.success, true);
  });

  it("employee create accepts minimal person", () => {
    const r = workforceEmployeeCreateSchema.safeParse({ firstName: "Alex", lastName: "Agent" });
    assert.equal(r.success, true);
  });

  it("employee list query accepts optional search q", () => {
    const r = workforceEmployeesListQuerySchema.safeParse({ page: 1, pageSize: 25, q: "  jane  " });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.q, "jane");
  });

  it("employee patch accepts workSchedule only", () => {
    const r = workforceEmployeePatchSchema.safeParse({
      workSchedule: [{ day: "mon", start: "08:00", end: "16:00" }]
    });
    assert.equal(r.success, true);
  });

  it("employee create accepts LinkedIn profile URL", () => {
    const r = workforceEmployeeCreateSchema.safeParse({
      firstName: "Alex",
      lastName: "Agent",
      linkedinUrl: "https://www.linkedin.com/in/alex-agent"
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.linkedinUrl, "https://www.linkedin.com/in/alex-agent");
  });

  it("employee create rejects non-LinkedIn URL", () => {
    const r = workforceEmployeeCreateSchema.safeParse({
      firstName: "Alex",
      lastName: "Agent",
      linkedinUrl: "https://example.com/alex"
    });
    assert.equal(r.success, false);
  });

  it("employee patch accepts linkedinUrl only (including clear)", () => {
    const set = workforceEmployeePatchSchema.safeParse({
      linkedinUrl: "https://linkedin.com/in/alex"
    });
    assert.equal(set.success, true);
    const clear = workforceEmployeePatchSchema.safeParse({ linkedinUrl: "" });
    assert.equal(clear.success, true);
    if (clear.success) assert.equal(clear.data.linkedinUrl, null);
  });
});
