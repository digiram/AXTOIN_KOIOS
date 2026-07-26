/**
 * Sales funnel — tenant pipeline stage configuration (phase 1).
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  DEFAULT_SALES_FUNNEL_BDR_STAGES,
  DEFAULT_SALES_FUNNEL_SALES_STAGES,
  type SalesFunnelPipeline,
  type SalesFunnelPipelineStagesPatchInput,
  type SalesFunnelStageOutcome
} from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const newId = () => randomUUID();

export type SalesFunnelStageRow = {
  id: string;
  tenantId: string;
  pipeline: SalesFunnelPipeline;
  stageKey: string;
  name: string;
  sortOrder: number;
  outcome: SalesFunnelStageOutcome;
  closeChancePercent: number | null;
  readyForSales: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const mapPg = (row: typeof pg.salesFunnelStages.$inferSelect): SalesFunnelStageRow => ({
  id: row.id,
  tenantId: row.tenantId,
  pipeline: row.pipeline as SalesFunnelPipeline,
  stageKey: row.stageKey,
  name: row.name,
  sortOrder: row.sortOrder,
  outcome: row.outcome as SalesFunnelStageOutcome,
  closeChancePercent: row.closeChancePercent ?? null,
  readyForSales: row.readyForSales,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapMysql = (row: typeof mysql.salesFunnelStages.$inferSelect): SalesFunnelStageRow => ({
  id: row.id,
  tenantId: row.tenantId,
  pipeline: row.pipeline as SalesFunnelPipeline,
  stageKey: row.stageKey,
  name: row.name,
  sortOrder: row.sortOrder,
  outcome: row.outcome as SalesFunnelStageOutcome,
  closeChancePercent: row.closeChancePercent ?? null,
  readyForSales: row.readyForSales,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const defaultOutcomeByKey = (pipeline: SalesFunnelPipeline, stageKey: string): SalesFunnelStageOutcome => {
  const defaults = pipeline === "bdr" ? DEFAULT_SALES_FUNNEL_BDR_STAGES : DEFAULT_SALES_FUNNEL_SALES_STAGES;
  return defaults.find((s) => s.stageKey === stageKey)?.outcome ?? "open";
};

const seedDefaults = async (tenantId: string): Promise<void> => {
  const now = new Date();
  const rows = [
    ...DEFAULT_SALES_FUNNEL_BDR_STAGES.map((s) => ({
      pipeline: "bdr" as const,
      stageKey: s.stageKey,
      name: s.name,
      sortOrder: s.sortOrder,
      outcome: s.outcome
    })),
    ...DEFAULT_SALES_FUNNEL_SALES_STAGES.map((s) => ({
      pipeline: "sales" as const,
      stageKey: s.stageKey,
      name: s.name,
      sortOrder: s.sortOrder,
      outcome: s.outcome
    }))
  ];

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    for (const row of rows) {
      await db.insert(mysql.salesFunnelStages).values({
        id: newId(),
        tenantId,
        pipeline: row.pipeline,
        stageKey: row.stageKey,
        name: row.name,
        sortOrder: row.sortOrder,
        outcome: row.outcome,
        readyForSales: row.pipeline === "bdr" && row.stageKey === "ready_for_sales",
        createdAt: now,
        updatedAt: now
      });
    }
    return;
  }
  const db = pgDb();
  await db.insert(pg.salesFunnelStages).values(
    rows.map((row) => ({
      tenantId,
      pipeline: row.pipeline,
      stageKey: row.stageKey,
      name: row.name,
      sortOrder: row.sortOrder,
      outcome: row.outcome,
      readyForSales: row.pipeline === "bdr" && row.stageKey === "ready_for_sales"
    }))
  );
};

export const ensureSalesFunnelStages = async (tenantId: string): Promise<SalesFunnelStageRow[]> => {
  const existing = await listSalesFunnelStages(tenantId);
  if (existing.length > 0) return existing;
  await seedDefaults(tenantId);
  return listSalesFunnelStages(tenantId);
};

export const listSalesFunnelStages = async (tenantId: string): Promise<SalesFunnelStageRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelStages)
      .where(eq(mysql.salesFunnelStages.tenantId, tenantId))
      .orderBy(asc(mysql.salesFunnelStages.pipeline), asc(mysql.salesFunnelStages.sortOrder));
    return rows.map(mapMysql);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelStages)
    .where(eq(pg.salesFunnelStages.tenantId, tenantId))
    .orderBy(asc(pg.salesFunnelStages.pipeline), asc(pg.salesFunnelStages.sortOrder));
  return rows.map(mapPg);
};

export type SalesFunnelPipelineConfig = {
  bdrStages: SalesFunnelStageRow[];
  salesStages: SalesFunnelStageRow[];
};

export const getSalesFunnelPipelineConfig = async (tenantId: string): Promise<SalesFunnelPipelineConfig> => {
  const rows = await ensureSalesFunnelStages(tenantId);
  return {
    bdrStages: rows.filter((r) => r.pipeline === "bdr"),
    salesStages: rows.filter((r) => r.pipeline === "sales")
  };
};

export const updateSalesFunnelPipelineConfig = async (
  tenantId: string,
  patch: SalesFunnelPipelineStagesPatchInput
): Promise<SalesFunnelPipelineConfig> => {
  await ensureSalesFunnelStages(tenantId);
  const now = new Date();

  const apply = async (pipeline: SalesFunnelPipeline, stages: SalesFunnelPipelineStagesPatchInput["bdrStages"]) => {
    for (const stage of stages) {
      const outcome = stage.outcome ?? defaultOutcomeByKey(pipeline, stage.stageKey);
      if (dialectFromEnv() === "mysql") {
        const db = mysqlDb();
        await db
          .update(mysql.salesFunnelStages)
          .set({ name: stage.name.trim(), sortOrder: stage.sortOrder, outcome, updatedAt: now })
          .where(
            and(
              eq(mysql.salesFunnelStages.tenantId, tenantId),
              eq(mysql.salesFunnelStages.pipeline, pipeline),
              eq(mysql.salesFunnelStages.stageKey, stage.stageKey)
            )
          );
      } else {
        const db = pgDb();
        await db
          .update(pg.salesFunnelStages)
          .set({ name: stage.name.trim(), sortOrder: stage.sortOrder, outcome, updatedAt: now })
          .where(
            and(
              eq(pg.salesFunnelStages.tenantId, tenantId),
              eq(pg.salesFunnelStages.pipeline, pipeline),
              eq(pg.salesFunnelStages.stageKey, stage.stageKey)
            )
          );
      }
    }
  };

  await apply("bdr", patch.bdrStages);
  await apply("sales", patch.salesStages);
  return getSalesFunnelPipelineConfig(tenantId);
};

export const getSalesFunnelStageById = async (
  tenantId: string,
  id: string
): Promise<SalesFunnelStageRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelStages)
      .where(and(eq(mysql.salesFunnelStages.tenantId, tenantId), eq(mysql.salesFunnelStages.id, id)))
      .limit(1);
    return rows[0] ? mapMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelStages)
    .where(and(eq(pg.salesFunnelStages.tenantId, tenantId), eq(pg.salesFunnelStages.id, id)))
    .limit(1);
  return rows[0] ? mapPg(rows[0]) : undefined;
};

export const listSalesFunnelStagesForPipeline = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline
): Promise<SalesFunnelStageRow[]> => {
  const rows = await ensureSalesFunnelStages(tenantId);
  return rows.filter((r) => r.pipeline === pipeline).sort((a, b) => a.sortOrder - b.sortOrder);
};

export const getDefaultSalesFunnelStageKey = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline
): Promise<string> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  if (!stages[0]) throw new Error("no_stages");
  return stages[0].stageKey;
};

/** Leftmost open lane on the pipeline board (excludes terminal won/lost stages on Sales). */
export const getFirstPipelineBoardStageKey = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline
): Promise<string> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  if (pipeline === "sales") {
    const open = stages.find((s) => s.outcome === "open");
    if (open) return open.stageKey;
  }
  if (stages[0]) return stages[0].stageKey;
  throw new Error("no_stages");
};

export const stageKeyValidForPipeline = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline,
  stageKey: string
): Promise<boolean> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  return stages.some((s) => s.stageKey === stageKey);
};

export const insertSalesFunnelStage = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline,
  name: string
): Promise<SalesFunnelStageRow> => {
  await ensureSalesFunnelStages(tenantId);
  const existing = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  const sortOrder = existing.length ? Math.max(...existing.map((s) => s.sortOrder)) + 1 : 0;
  const id = newId();
  const stageKey = newId();
  const now = new Date();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.salesFunnelStages).values({
      id,
      tenantId,
      pipeline,
      stageKey,
      name: name.trim(),
      sortOrder,
      outcome: "open",
      createdAt: now,
      updatedAt: now
    });
  } else {
    const db = pgDb();
    await db.insert(pg.salesFunnelStages).values({
      id,
      tenantId,
      pipeline,
      stageKey,
      name: name.trim(),
      sortOrder,
      outcome: "open"
    });
  }

  return (await getSalesFunnelStageById(tenantId, id))!;
};

export const reorderSalesFunnelStages = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline,
  stageIds: string[]
): Promise<SalesFunnelStageRow[]> => {
  const existing = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  if (stageIds.length !== existing.length) throw new Error("invalid_reorder");
  const idSet = new Set(existing.map((s) => s.id));
  if (!stageIds.every((id) => idSet.has(id))) throw new Error("invalid_reorder");

  const now = new Date();
  for (let i = 0; i < stageIds.length; i++) {
    const stageId = stageIds[i]!;
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      await db
        .update(mysql.salesFunnelStages)
        .set({ sortOrder: i, updatedAt: now })
        .where(
          and(
            eq(mysql.salesFunnelStages.tenantId, tenantId),
            eq(mysql.salesFunnelStages.id, stageId)
          )
        );
    } else {
      const db = pgDb();
      await db
        .update(pg.salesFunnelStages)
        .set({ sortOrder: i, updatedAt: now })
        .where(
          and(eq(pg.salesFunnelStages.tenantId, tenantId), eq(pg.salesFunnelStages.id, stageId))
        );
    }
  }

  return listSalesFunnelStagesForPipeline(tenantId, pipeline);
};

export const getSalesFunnelStageByKey = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline,
  stageKey: string
): Promise<SalesFunnelStageRow | undefined> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, pipeline);
  return stages.find((s) => s.stageKey === stageKey);
};

const clearReadyForSalesOnOtherBdrStages = async (
  tenantId: string,
  exceptStageId: string
): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelStages)
      .set({ readyForSales: false, updatedAt: now })
      .where(
        and(
          eq(mysql.salesFunnelStages.tenantId, tenantId),
          eq(mysql.salesFunnelStages.pipeline, "bdr"),
          ne(mysql.salesFunnelStages.id, exceptStageId)
        )
      );
    return;
  }
  const db = pgDb();
  await db
    .update(pg.salesFunnelStages)
    .set({ readyForSales: false, updatedAt: now })
    .where(
      and(
        eq(pg.salesFunnelStages.tenantId, tenantId),
        eq(pg.salesFunnelStages.pipeline, "bdr"),
        ne(pg.salesFunnelStages.id, exceptStageId)
      )
    );
};

export const updateSalesFunnelStage = async (
  tenantId: string,
  id: string,
  patch: {
    name?: string;
    outcome?: SalesFunnelStageOutcome;
    closeChancePercent?: number | null;
    readyForSales?: boolean;
  }
): Promise<SalesFunnelStageRow> => {
  const row = await getSalesFunnelStageById(tenantId, id);
  if (!row) throw new Error("not_found");

  if (patch.closeChancePercent !== undefined && row.pipeline !== "sales") {
    throw new Error("close_chance_sales_only");
  }
  if (patch.readyForSales !== undefined && row.pipeline !== "bdr") {
    throw new Error("ready_for_sales_bdr_only");
  }

  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.outcome !== undefined) set.outcome = patch.outcome;
  if (patch.closeChancePercent !== undefined) set.closeChancePercent = patch.closeChancePercent;
  if (patch.readyForSales !== undefined) set.readyForSales = patch.readyForSales;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelStages)
      .set(set)
      .where(and(eq(mysql.salesFunnelStages.tenantId, tenantId), eq(mysql.salesFunnelStages.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelStages)
      .set(set)
      .where(and(eq(pg.salesFunnelStages.tenantId, tenantId), eq(pg.salesFunnelStages.id, id)));
  }

  if (patch.readyForSales === true && row.pipeline === "bdr") {
    await clearReadyForSalesOnOtherBdrStages(tenantId, id);
  }

  return (await getSalesFunnelStageById(tenantId, id))!;
};

export const countSalesFunnelStageUsage = async (
  tenantId: string,
  pipeline: SalesFunnelPipeline,
  stageKey: string
): Promise<number> => {
  if (pipeline === "bdr") {
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(mysql.salesFunnelBdrLeads)
        .where(
          and(
            eq(mysql.salesFunnelBdrLeads.tenantId, tenantId),
            eq(mysql.salesFunnelBdrLeads.stageKey, stageKey),
            isNull(mysql.salesFunnelBdrLeads.archivedAt),
            eq(mysql.salesFunnelBdrLeads.active, true)
          )
        );
      return Number(rows[0]?.count ?? 0);
    }
    const db = pgDb();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(pg.salesFunnelBdrLeads)
      .where(
        and(
          eq(pg.salesFunnelBdrLeads.tenantId, tenantId),
          eq(pg.salesFunnelBdrLeads.stageKey, stageKey),
          isNull(pg.salesFunnelBdrLeads.archivedAt),
          eq(pg.salesFunnelBdrLeads.active, true)
        )
      );
    return Number(rows[0]?.count ?? 0);
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(mysql.salesFunnelSalesDeals)
      .where(
        and(
          eq(mysql.salesFunnelSalesDeals.tenantId, tenantId),
          eq(mysql.salesFunnelSalesDeals.stageKey, stageKey),
          isNull(mysql.salesFunnelSalesDeals.archivedAt),
          eq(mysql.salesFunnelSalesDeals.active, true)
        )
      );
    return Number(rows[0]?.count ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(pg.salesFunnelSalesDeals)
    .where(
      and(
        eq(pg.salesFunnelSalesDeals.tenantId, tenantId),
        eq(pg.salesFunnelSalesDeals.stageKey, stageKey),
        isNull(pg.salesFunnelSalesDeals.archivedAt),
        eq(pg.salesFunnelSalesDeals.active, true)
      )
    );
  return Number(rows[0]?.count ?? 0);
};

export const deleteSalesFunnelStage = async (tenantId: string, id: string): Promise<void> => {
  const row = await getSalesFunnelStageById(tenantId, id);
  if (!row) throw new Error("not_found");

  const pipelineStages = await listSalesFunnelStagesForPipeline(tenantId, row.pipeline);
  if (pipelineStages.length <= 1) throw new Error("last_stage");

  const inUse = await countSalesFunnelStageUsage(tenantId, row.pipeline, row.stageKey);
  if (inUse > 0) throw new Error("stage_not_empty");

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.salesFunnelStages)
      .where(and(eq(mysql.salesFunnelStages.tenantId, tenantId), eq(mysql.salesFunnelStages.id, id)));
  } else {
    const db = pgDb();
    await db
      .delete(pg.salesFunnelStages)
      .where(and(eq(pg.salesFunnelStages.tenantId, tenantId), eq(pg.salesFunnelStages.id, id)));
  }
};
