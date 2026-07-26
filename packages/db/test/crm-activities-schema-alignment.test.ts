/**
 * Guards against CRM activity regressions where Drizzle schemas reference columns
 * (e.g. `direction`) that are missing from the baseline SQL migration.
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

describe("CRM activities: Drizzle schema ↔ baseline migration", () => {
  it("PostgreSQL Drizzle table includes direction column", () => {
    assert.ok("direction" in getTableColumns(pg.crmActivities), "pg.crmActivities must define `direction`");
  });

  it("MySQL Drizzle table includes direction column", () => {
    assert.ok("direction" in getTableColumns(mysql.crmActivities), "mysql.crmActivities must define `direction`");
  });

  it("PG baseline creates crm_activities with direction", () => {
    const sql = readBaseline("pg");
    assert.match(sql, /\bdirection\b/i);
    assert.match(sql, /crm_activities/i);
  });

  it("MySQL baseline creates crm_activities with direction", () => {
    const sql = readBaseline("mysql");
    assert.match(sql, /\bdirection\b/i);
    assert.match(sql, /crm_activities/i);
  });
});
