/**
 * Stripe webhook idempotency — claim event ids before side effects; release on handler failure for Stripe retry.
 */

import { eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

/**
 * @returns `true` when this process should handle the event; `false` when already claimed (return 200 to Stripe).
 */
export const claimStripeWebhookEvent = async (
  stripeEventId: string,
  eventType: string
): Promise<boolean> => {
  const id = stripeEventId.trim();
  if (!id) return false;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const result = await db.execute(
      sql`INSERT IGNORE INTO processed_stripe_events (stripe_event_id, event_type) VALUES (${id}, ${eventType})`
    );
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? Number((header as { affectedRows: number }).affectedRows)
        : 0;
    return affected === 1;
  }

  const db = pgDb();
  const rows = await db
    .insert(pg.processedStripeEvents)
    .values({ stripeEventId: id, eventType })
    .onConflictDoNothing()
    .returning({ stripeEventId: pg.processedStripeEvents.stripeEventId });
  return rows.length > 0;
};

/** Allows Stripe to retry after a transient handler failure. */
export const releaseStripeWebhookEvent = async (stripeEventId: string): Promise<void> => {
  const id = stripeEventId.trim();
  if (!id) return;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.delete(mysql.processedStripeEvents).where(eq(mysql.processedStripeEvents.stripeEventId, id));
    return;
  }

  const db = pgDb();
  await db.delete(pg.processedStripeEvents).where(eq(pg.processedStripeEvents.stripeEventId, id));
};
