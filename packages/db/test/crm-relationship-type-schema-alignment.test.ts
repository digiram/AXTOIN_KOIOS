/**
 * Ensures CRM relationship type baseline SQL and Drizzle schema stay aligned.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getTableColumns } from "drizzle-orm";

import * as mysql from "../src/mysql-schema.js";
import * as pg from "../src/pg-schema.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const readBaseline = (dialect: "pg" | "mysql") =>
  readFileSync(join(pkgRoot, "drizzle", dialect, "0000_baseline.sql"), "utf8");

describe("CRM relationship type system columns", () => {
  it("Drizzle pg.crmRelationshipTypes defines reverse_name, is_system", () => {
    const cols = getTableColumns(pg.crmRelationshipTypes);
    assert.ok("reverseName" in cols);
    assert.ok("isSystem" in cols);
  });

  it("Drizzle mysql.crmRelationshipTypes defines reverse_name, is_system", () => {
    const cols = getTableColumns(mysql.crmRelationshipTypes);
    assert.ok("reverseName" in cols);
    assert.ok("isSystem" in cols);
  });

  it("PG baseline creates crm_relationship_types with reverse_name and is_system", () => {
    const sql = readBaseline("pg");
    assert.match(sql, /reverse_name/i);
    assert.match(sql, /is_system/i);
  });

  it("MySQL baseline creates crm_relationship_types with reverse_name and is_system", () => {
    const sql = readBaseline("mysql");
    assert.match(sql, /reverse_name/i);
    assert.match(sql, /is_system/i);
  });
});
