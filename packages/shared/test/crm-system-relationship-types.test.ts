/**
 * Tests for seeded CRM system relationship types and reserved name guard.
 *
 * Under test: `../src/crm.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS,
  isReservedCrmRelationshipTypeName
} from "../src/crm.js";

describe("CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS", () => {
  it("seeds built-in relationship kinds including four Other direction pairs", () => {
    assert.equal(CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS.length, 10);
  });

  it("isReservedCrmRelationshipTypeName matches forward and reverse labels", () => {
    assert.equal(isReservedCrmRelationshipTypeName("Employee"), true);
    assert.equal(isReservedCrmRelationshipTypeName("employer"), true);
    assert.equal(isReservedCrmRelationshipTypeName("Other"), true);
    assert.equal(isReservedCrmRelationshipTypeName("Custom vendor"), false);
  });
});
