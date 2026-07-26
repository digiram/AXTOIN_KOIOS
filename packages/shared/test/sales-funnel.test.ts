/**
 * Tests for sales funnel pipeline enums and shared validation helpers.
 *
 * Under test: `../src/sales-funnel.js` and related funnel modules
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSalesFunnelModuleAvailable,
  salesFunnelPipelineStagesPatchSchema
} from "../src/sales-funnel.js";
import {
  salesFunnelStageCreateSchema,
  salesFunnelStageReorderSchema
} from "../src/sales-funnel-stages.js";
import {
  salesFunnelSalesDealCreateSchema,
  salesFunnelSalesDealPatchSchema,
  salesFunnelSalesDealStagePatchSchema
} from "../src/sales-funnel-deals.js";
import {
  parseSalesFunnelTagsJson,
  salesFunnelBdrLeadCreateSchema,
  salesFunnelBdrLeadPromoteSchema,
  salesFunnelBdrLeadStagePatchSchema,
  stringifySalesFunnelTags
} from "../src/sales-funnel-leads.js";

describe("sales funnel", () => {
  it("requires CRM and platform Sales flag", () => {
    assert.equal(isSalesFunnelModuleAvailable({ crmEnabled: true, salesFunnelEnabled: true }), true);
    assert.equal(isSalesFunnelModuleAvailable({ crmEnabled: false, salesFunnelEnabled: true }), false);
    assert.equal(isSalesFunnelModuleAvailable({ crmEnabled: true, salesFunnelEnabled: false }), false);
  });

  it("accepts pipeline patch with tenant-defined stage keys", () => {
    const parsed = salesFunnelPipelineStagesPatchSchema.safeParse({
      bdrStages: [{ stageKey: "a1b2c3d4", name: "Inbound", sortOrder: 0 }],
      salesStages: [{ stageKey: "e5f6g7h8", name: "Discovery", sortOrder: 0 }]
    });
    assert.equal(parsed.success, true);
  });

  it("validates stage create and lane reorder", () => {
    const create = salesFunnelStageCreateSchema.safeParse({ pipeline: "bdr", name: "Follow-up" });
    assert.equal(create.success, true);

    const reorder = salesFunnelStageReorderSchema.safeParse({
      pipeline: "sales",
      stageIds: ["00000000-0000-4000-8000-000000000001"]
    });
    assert.equal(reorder.success, true);
  });

  it("parses and stringifies lead tags JSON", () => {
    assert.deepEqual(parseSalesFunnelTagsJson(null), []);
    assert.deepEqual(parseSalesFunnelTagsJson('["a","b"]'), ["a", "b"]);
    assert.equal(stringifySalesFunnelTags(["x", "x"]), '["x"]');
  });

  it("validates BDR lead create and stage patch", () => {
    const create = salesFunnelBdrLeadCreateSchema.safeParse({ title: "Acme intro" });
    assert.equal(create.success, true);

    const stage = salesFunnelBdrLeadStagePatchSchema.safeParse({ stageKey: "tenant-lane-uuid" });
    assert.equal(stage.success, true);
  });

  it("validates BDR lead promote body", () => {
    const ok = salesFunnelBdrLeadPromoteSchema.safeParse({});
    assert.equal(ok.success, true);

    const withStage = salesFunnelBdrLeadPromoteSchema.safeParse({ stageKey: "tenant-lane-uuid" });
    assert.equal(withStage.success, true);
  });

  it("validates Sales deal create and stage patch", () => {
    const create = salesFunnelSalesDealCreateSchema.safeParse({ title: "Enterprise renewal" });
    assert.equal(create.success, true);

    const withValue = salesFunnelSalesDealCreateSchema.safeParse({
      title: "Enterprise renewal",
      expectedValueMinor: 99_00,
      expectedValueCurrency: "usd"
    });
    assert.equal(withValue.success, true);
    if (withValue.success) {
      assert.equal(withValue.data.expectedValueCurrency, "USD");
    }

    const badPair = salesFunnelSalesDealCreateSchema.safeParse({
      title: "Enterprise renewal",
      expectedValueMinor: 100
    });
    assert.equal(badPair.success, false);

    const patchClear = salesFunnelSalesDealPatchSchema.safeParse({
      expectedValueMinor: null,
      expectedValueCurrency: null
    });
    assert.equal(patchClear.success, true);

    const patchBad = salesFunnelSalesDealPatchSchema.safeParse({
      expectedValueMinor: 100
    });
    assert.equal(patchBad.success, false);

    const stage = salesFunnelSalesDealStagePatchSchema.safeParse({ stageKey: "tenant-lane-uuid" });
    assert.equal(stage.success, true);
  });
});
