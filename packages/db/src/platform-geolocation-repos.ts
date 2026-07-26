/**
 * Platform singleton: geolocation integrations (Nominatim first).
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

export const PLATFORM_GEOLOCATION_ROW_ID = "00000000-0000-0000-0000-000000000002";

const DEFAULT_NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export type PlatformGeolocationRow = {
  id: string;
  nominatimBaseUrl: string;
  nominatimContactEmail: string | null;
  nominatimEnabled: boolean;
  updatedAt: Date;
};

export const getPlatformGeolocationSettingsRow = async (): Promise<PlatformGeolocationRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformGeolocationSettings)
      .where(eq(mysql.platformGeolocationSettings.id, PLATFORM_GEOLOCATION_ROW_ID))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      nominatimBaseUrl: row.nominatimBaseUrl,
      nominatimContactEmail: row.nominatimContactEmail,
      nominatimEnabled: Boolean(row.nominatimEnabled),
      updatedAt: row.updatedAt
    };
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformGeolocationSettings)
    .where(eq(pg.platformGeolocationSettings.id, PLATFORM_GEOLOCATION_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    nominatimBaseUrl: row.nominatimBaseUrl,
    nominatimContactEmail: row.nominatimContactEmail,
    nominatimEnabled: row.nominatimEnabled,
    updatedAt: row.updatedAt
  };
};

export const upsertPlatformGeolocationSettingsRow = async (input: {
  nominatimBaseUrl: string;
  nominatimContactEmail: string | null;
  nominatimEnabled: boolean;
}): Promise<void> => {
  const existing = await getPlatformGeolocationSettingsRow();
  const now = new Date();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!existing) {
      await db.insert(mysql.platformGeolocationSettings).values({
        id: PLATFORM_GEOLOCATION_ROW_ID,
        nominatimBaseUrl: input.nominatimBaseUrl,
        nominatimContactEmail: input.nominatimContactEmail,
        nominatimEnabled: input.nominatimEnabled,
        updatedAt: now
      });
      return;
    }
    await db
      .update(mysql.platformGeolocationSettings)
      .set({
        nominatimBaseUrl: input.nominatimBaseUrl,
        nominatimContactEmail: input.nominatimContactEmail,
        nominatimEnabled: input.nominatimEnabled,
        updatedAt: now
      })
      .where(eq(mysql.platformGeolocationSettings.id, PLATFORM_GEOLOCATION_ROW_ID));
    return;
  }

  const db = pgDb();
  if (!existing) {
    await db.insert(pg.platformGeolocationSettings).values({
      id: PLATFORM_GEOLOCATION_ROW_ID,
      nominatimBaseUrl: input.nominatimBaseUrl,
      nominatimContactEmail: input.nominatimContactEmail,
      nominatimEnabled: input.nominatimEnabled,
      updatedAt: now
    });
    return;
  }
  await db
    .update(pg.platformGeolocationSettings)
    .set({
      nominatimBaseUrl: input.nominatimBaseUrl,
      nominatimContactEmail: input.nominatimContactEmail,
      nominatimEnabled: input.nominatimEnabled,
      updatedAt: now
    })
    .where(eq(pg.platformGeolocationSettings.id, PLATFORM_GEOLOCATION_ROW_ID));
};

/** Ensures the singleton row exists with public Nominatim defaults. */
export const ensurePlatformGeolocationSettingsRow = async (): Promise<PlatformGeolocationRow> => {
  const row = await getPlatformGeolocationSettingsRow();
  if (row) return row;
  await upsertPlatformGeolocationSettingsRow({
    nominatimBaseUrl: DEFAULT_NOMINATIM_BASE,
    nominatimContactEmail: null,
    nominatimEnabled: true
  });
  const created = await getPlatformGeolocationSettingsRow();
  if (!created) throw new Error("ensurePlatformGeolocationSettingsRow failed");
  return created;
};
