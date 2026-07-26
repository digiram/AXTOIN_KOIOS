/**
 * Schema alignment for app_cache_entries and background_jobs (baseline).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { getTableColumns } from "drizzle-orm";

import * as mysql from "../src/mysql-schema.js";
import * as pg from "../src/pg-schema.js";
import { truncateJobPersistText, rowsFromPgExecute, isBackgroundJobRowId } from "../src/background-jobs-repos.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

const readJournal = (dialect: "pg" | "mysql") =>
  JSON.parse(readFileSync(join(pkgRoot, "drizzle", dialect, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };

describe("app_cache_entries + background_jobs", () => {
  it("Drizzle pg tables define expected columns", () => {
    const cache = getTableColumns(pg.appCacheEntries);
    assert.ok(cache.namespace);
    assert.ok(cache.cacheKey);
    assert.ok(cache.payload);
    assert.ok(cache.expiresAt);

    const jobs = getTableColumns(pg.backgroundJobs);
    assert.ok(jobs.queueName);
    assert.ok(jobs.jobName);
    assert.ok(jobs.dedupeKey);
    assert.ok(jobs.purgeAfter);
  });

  it("Drizzle mysql tables define expected columns", () => {
    const cache = getTableColumns(mysql.appCacheEntries);
    assert.ok(cache.namespace);
    assert.ok(cache.cacheKey);
    assert.ok(cache.payload);
    assert.ok(cache.expiresAt);

    const jobs = getTableColumns(mysql.backgroundJobs);
    assert.ok(jobs.queueName);
    assert.ok(jobs.jobName);
    assert.ok(jobs.dedupeKey);
    assert.ok(jobs.purgeAfter);
  });

  it("baseline migration creates cache and job tables", () => {
    const sql = readFileSync(join(pkgRoot, "drizzle", "pg", "0000_baseline.sql"), "utf8");
    assert.match(sql, /app_cache_entries/i);
    assert.match(sql, /background_jobs/i);
  });

  it("MySQL baseline migration creates cache and job tables", () => {
    const sql = readFileSync(join(pkgRoot, "drizzle", "mysql", "0000_baseline.sql"), "utf8");
    assert.match(sql, /app_cache_entries/i);
    assert.match(sql, /background_jobs/i);
  });

  it("PG and MySQL journals list baseline and workforce socials migration", () => {
    for (const dialect of ["pg", "mysql"] as const) {
      const tags = readJournal(dialect).entries.map((e) => e.tag);
      assert.ok(tags.includes("0000_baseline"), `${dialect} journal: ${tags.join(", ")}`);
      assert.ok(tags.includes("0001_workforce_employee_socials"), `${dialect} journal: ${tags.join(", ")}`);
    }
  });

  it("truncateJobPersistText caps UTF-8 payload at 4096 bytes", () => {
    const long = "x".repeat(5000);
    const out = truncateJobPersistText(long);
    assert.ok(out);
    assert.ok(Buffer.byteLength(out!, "utf8") <= 4096);
  });

  it("rowsFromPgExecute accepts pg driver row arrays and { rows } objects", () => {
    assert.deepEqual(rowsFromPgExecute<{ id: string }>([{ id: "a" }]), [{ id: "a" }]);
    assert.deepEqual(rowsFromPgExecute<{ id: string }>({ rows: [{ id: "b" }] }), [{ id: "b" }]);
    assert.deepEqual(rowsFromPgExecute({}), []);
  });

  it("isBackgroundJobRowId distinguishes UUID row ids from BullMQ dedupe keys", () => {
    assert.equal(isBackgroundJobRowId("224dd981-fc8e-425f-a5a4-c789b937d8d8"), true);
    assert.equal(isBackgroundJobRowId("mailbox-sync-account-224dd981-fc8e-425f-a5a4-c789b937d8d8"), false);
    assert.equal(isBackgroundJobRowId("not-a-uuid"), false);
  });
});
