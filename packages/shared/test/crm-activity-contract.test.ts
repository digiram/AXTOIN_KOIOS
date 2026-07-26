/**
 * HTTP/API contract for CRM activities — catches enum or body-shape drift before apps ship.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { crmActivitiesQuerySchema, crmActivityCreateSchema, crmActivityTypeSchema } from "../src/crm.js";

describe("crmActivityCreateSchema / crmActivityTypeSchema", () => {
  it("accepts extended activity types", () => {
    for (const t of ["NOTE", "EMAIL", "MAIL", "CALL", "MEETING", "CONVERSATION"] as const) {
      assert.doesNotThrow(() => crmActivityTypeSchema.parse(t));
    }
  });

  it("accepts optional direction INBOUND | OUTBOUND", () => {
    const parsed = crmActivityCreateSchema.parse({
      activityType: "EMAIL",
      description: "Followed up on pricing.",
      relatedEntityId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      relatedEntityKind: "CONTACT",
      scheduledAt: null,
      direction: "INBOUND"
    });
    assert.equal(parsed.direction, "INBOUND");
  });

  it("accepts null direction", () => {
    const parsed = crmActivityCreateSchema.parse({
      activityType: "CALL",
      description: "Left voicemail.",
      relatedEntityId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      relatedEntityKind: "ORGANIZATION",
      direction: null
    });
    assert.equal(parsed.direction, null);
  });
});

describe("crmActivitiesQuerySchema", () => {
  it("accepts base entity params only", () => {
    const parsed = crmActivitiesQuerySchema.parse({
      relatedKind: "CONTACT",
      relatedId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    });
    assert.equal(parsed.activityType, undefined);
    assert.equal(parsed.datePreset, undefined);
  });

  it("accepts between with dateFrom and dateTo", () => {
    const parsed = crmActivitiesQuerySchema.parse({
      relatedKind: "ORGANIZATION",
      relatedId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      datePreset: "between",
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      q: "pricing"
    });
    assert.equal(parsed.datePreset, "between");
    assert.equal(parsed.dateField, undefined);
    assert.equal(parsed.q, "pricing");
  });

  it("rejects between without dateTo", () => {
    const r = crmActivitiesQuerySchema.safeParse({
      relatedKind: "CONTACT",
      relatedId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      datePreset: "between",
      dateFrom: "2025-01-01"
    });
    assert.equal(r.success, false);
  });

  it("rejects orphan dateFrom without datePreset", () => {
    const r = crmActivitiesQuerySchema.safeParse({
      relatedKind: "CONTACT",
      relatedId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      dateFrom: "2025-01-01"
    });
    assert.equal(r.success, false);
  });
});
