/**
 * Platform singleton: module-level feature toggles (CRM, self-service signup, …).
 */

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export const PLATFORM_MODULE_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000004";

export type PlatformModuleSettingsRow = {
  id: string;
  crmEnabled: boolean;
  hrmEnabled: boolean;
  salesFunnelEnabled: boolean;
  companySubscriptionsEnabled: boolean;
  invoicingEnabled: boolean;
  mailboxEnabled: boolean;
  selfRegisterEnabled: boolean;
  mfaTotpEnabled: boolean;
  updatedAt: Date;
};

export const getPlatformModuleSettingsRow = async (): Promise<PlatformModuleSettingsRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformModuleSettings)
      .where(eq(mysql.platformModuleSettings.id, PLATFORM_MODULE_SETTINGS_ROW_ID))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      crmEnabled: Boolean(row.crmEnabled),
      hrmEnabled: Boolean(row.hrmEnabled ?? false),
      salesFunnelEnabled: Boolean(row.salesFunnelEnabled ?? false),
      companySubscriptionsEnabled: Boolean(row.companySubscriptionsEnabled ?? false),
      invoicingEnabled: Boolean(row.invoicingEnabled ?? false),
      mailboxEnabled: Boolean(row.mailboxEnabled ?? false),
      selfRegisterEnabled: Boolean(row.selfRegisterEnabled ?? false),
      mfaTotpEnabled: Boolean(row.mfaTotpEnabled),
      updatedAt: row.updatedAt
    };
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformModuleSettings)
    .where(eq(pg.platformModuleSettings.id, PLATFORM_MODULE_SETTINGS_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    crmEnabled: row.crmEnabled,
    hrmEnabled: row.hrmEnabled ?? false,
    salesFunnelEnabled: row.salesFunnelEnabled ?? false,
    companySubscriptionsEnabled: row.companySubscriptionsEnabled ?? false,
    invoicingEnabled: row.invoicingEnabled ?? false,
    mailboxEnabled: row.mailboxEnabled ?? false,
    selfRegisterEnabled: row.selfRegisterEnabled ?? false,
    mfaTotpEnabled: row.mfaTotpEnabled ?? false,
    updatedAt: row.updatedAt
  };
};

export type PlatformModuleSettingsPatch = {
  crmEnabled?: boolean;
  hrmEnabled?: boolean;
  salesFunnelEnabled?: boolean;
  companySubscriptionsEnabled?: boolean;
  invoicingEnabled?: boolean;
  mailboxEnabled?: boolean;
  selfRegisterEnabled?: boolean;
  mfaTotpEnabled?: boolean;
};

/** Resolve patch with CRM → Sales dependency (Sales requires CRM; disabling CRM turns Sales off). */
export const resolvePlatformModuleSettingsPatch = (
  input: PlatformModuleSettingsPatch,
  existing: PlatformModuleSettingsRow | undefined
): PlatformModuleSettingsPatch & {
  crmEnabled: boolean;
  hrmEnabled: boolean;
  salesFunnelEnabled: boolean;
  companySubscriptionsEnabled: boolean;
  invoicingEnabled: boolean;
  mailboxEnabled: boolean;
  selfRegisterEnabled: boolean;
  mfaTotpEnabled: boolean;
} => {
  const crmEnabled = input.crmEnabled ?? existing?.crmEnabled ?? true;
  let salesFunnelEnabled = input.salesFunnelEnabled ?? existing?.salesFunnelEnabled ?? false;
  if (!crmEnabled) salesFunnelEnabled = false;
  if (input.salesFunnelEnabled === true && !crmEnabled) {
    throw new Error("crm_required_for_sales");
  }
  return {
    crmEnabled,
    hrmEnabled: input.hrmEnabled ?? existing?.hrmEnabled ?? false,
    salesFunnelEnabled,
    companySubscriptionsEnabled: input.companySubscriptionsEnabled ?? existing?.companySubscriptionsEnabled ?? false,
    invoicingEnabled: input.invoicingEnabled ?? existing?.invoicingEnabled ?? false,
    mailboxEnabled: input.mailboxEnabled ?? existing?.mailboxEnabled ?? false,
    selfRegisterEnabled: input.selfRegisterEnabled ?? existing?.selfRegisterEnabled ?? false,
    mfaTotpEnabled: input.mfaTotpEnabled ?? existing?.mfaTotpEnabled ?? false
  };
};

export const upsertPlatformModuleSettingsRow = async (input: PlatformModuleSettingsPatch): Promise<void> => {
  const existing = await getPlatformModuleSettingsRow();
  const resolved = resolvePlatformModuleSettingsPatch(input, existing);
  const { crmEnabled, hrmEnabled, salesFunnelEnabled, companySubscriptionsEnabled, invoicingEnabled, mailboxEnabled, selfRegisterEnabled, mfaTotpEnabled } =
    resolved;
  const now = new Date();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!existing) {
      await db.insert(mysql.platformModuleSettings).values({
        id: PLATFORM_MODULE_SETTINGS_ROW_ID,
        crmEnabled,
        hrmEnabled,
        salesFunnelEnabled,
        companySubscriptionsEnabled,
        invoicingEnabled,
        mailboxEnabled,
        selfRegisterEnabled,
        mfaTotpEnabled,
        updatedAt: now
      });
      return;
    }
    await db
      .update(mysql.platformModuleSettings)
      .set({
        crmEnabled,
        hrmEnabled,
        salesFunnelEnabled,
        companySubscriptionsEnabled,
        invoicingEnabled,
        mailboxEnabled,
        selfRegisterEnabled,
        mfaTotpEnabled,
        updatedAt: now
      })
      .where(eq(mysql.platformModuleSettings.id, PLATFORM_MODULE_SETTINGS_ROW_ID));
    return;
  }

  const db = pgDb();
  if (!existing) {
    await db.insert(pg.platformModuleSettings).values({
      id: PLATFORM_MODULE_SETTINGS_ROW_ID,
      crmEnabled,
      hrmEnabled,
      salesFunnelEnabled,
      companySubscriptionsEnabled,
      invoicingEnabled,
      mailboxEnabled,
      selfRegisterEnabled,
      mfaTotpEnabled,
      updatedAt: now
    });
    return;
  }
  await db
    .update(pg.platformModuleSettings)
    .set({
      crmEnabled,
      hrmEnabled,
      salesFunnelEnabled,
      companySubscriptionsEnabled,
      invoicingEnabled,
      mailboxEnabled,
      selfRegisterEnabled,
      mfaTotpEnabled,
      updatedAt: now
    })
    .where(eq(pg.platformModuleSettings.id, PLATFORM_MODULE_SETTINGS_ROW_ID));
};

export const ensurePlatformModuleSettingsRow = async (): Promise<PlatformModuleSettingsRow> => {
  const row = await getPlatformModuleSettingsRow();
  if (row) return row;
  await upsertPlatformModuleSettingsRow({ crmEnabled: true, hrmEnabled: false, selfRegisterEnabled: false, mfaTotpEnabled: false });
  const created = await getPlatformModuleSettingsRow();
  if (!created) throw new Error("ensurePlatformModuleSettingsRow failed");
  return created;
};
