/**
 * Invoicing offer customer response tokens.
 *
 * Issues opaque tokens that let external customers accept/decline offers without a realm login.
 * Only SHA-256 hashes are stored; plaintext is returned once at issuance.
 *
 * Responsibilities:
 * - Issue or rotate response tokens per tenant offer
 * - Lookup offer by presented token secret
 * - Constant-time hash comparison helper
 *
 * Depends on:
 * - `invoicing-repos.getOfferById` for offer hydration after token lookup
 * - `invoicing_offer_response_tokens` table (pg/mysql schema)
 *
 * Security:
 * - Queries filter by `tenant_id` when issuing; lookup is hash-only (no tenant id in URL token).
 * - Plaintext token returned only from `issueInvoicingOfferResponseToken`; never log or cache it.
 * - Use `offerResponseTokenMatches` for timing-safe verification.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH } from "@starter/shared";

import { mysqlDb, pgDb } from "./crm-repos-db.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { getOfferById, type InvoicingOfferRow } from "./invoicing-repos.js";
import { dialectFromEnv } from "./schema.js";

const isMysql = () => dialectFromEnv() === "mysql";

export type InvoicingOfferResponseTokenRow = {
  id: string;
  tenantId: string;
  offerId: string;
  tokenHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export const hashInvoicingOfferResponseToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const newOfferResponseTokenSecret = (): string =>
  randomBytes(INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH).toString("base64url");

const mapTokenRow = (
  row: typeof pg.invoicingOfferResponseTokens.$inferSelect | typeof mysql.invoicingOfferResponseTokens.$inferSelect
): InvoicingOfferResponseTokenRow => ({
  id: row.id,
  tenantId: row.tenantId,
  offerId: row.offerId,
  tokenHash: row.tokenHash,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

/** Issues or rotates the customer response token for an offer. Returns the plaintext secret once. */
export const issueInvoicingOfferResponseToken = async (
  tenantId: string,
  offerId: string
): Promise<string> => {
  const token = newOfferResponseTokenSecret();
  const tokenHash = hashInvoicingOfferResponseToken(token);
  const now = new Date();
  if (isMysql()) {
    const existing = await mysqlDb()
      .select({ id: mysql.invoicingOfferResponseTokens.id })
      .from(mysql.invoicingOfferResponseTokens)
      .where(
        and(
          eq(mysql.invoicingOfferResponseTokens.tenantId, tenantId),
          eq(mysql.invoicingOfferResponseTokens.offerId, offerId)
        )
      )
      .limit(1);
    if (existing[0]) {
      await mysqlDb()
        .update(mysql.invoicingOfferResponseTokens)
        .set({ tokenHash, updatedAt: now })
        .where(eq(mysql.invoicingOfferResponseTokens.id, existing[0].id));
      return token;
    }
    await mysqlDb().insert(mysql.invoicingOfferResponseTokens).values({
      id: randomUUID(),
      tenantId,
      offerId,
      tokenHash,
      createdAt: now,
      updatedAt: now
    });
    return token;
  }

  const existing = await pgDb()
    .select({ id: pg.invoicingOfferResponseTokens.id })
    .from(pg.invoicingOfferResponseTokens)
    .where(
      and(
        eq(pg.invoicingOfferResponseTokens.tenantId, tenantId),
        eq(pg.invoicingOfferResponseTokens.offerId, offerId)
      )
    )
    .limit(1);
  if (existing[0]) {
    await pgDb()
      .update(pg.invoicingOfferResponseTokens)
      .set({ tokenHash, updatedAt: now })
      .where(eq(pg.invoicingOfferResponseTokens.id, existing[0].id));
    return token;
  }
  await pgDb().insert(pg.invoicingOfferResponseTokens).values({
    tenantId,
    offerId,
    tokenHash,
    createdAt: now,
    updatedAt: now
  });
  return token;
};

/** Looks up token row and parent offer by presented plaintext secret (hash-only DB query). */
export const findInvoicingOfferResponseTokenBySecret = async (
  token: string
): Promise<{ tokenRow: InvoicingOfferResponseTokenRow; offer: InvoicingOfferRow } | null> => {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const tokenHash = hashInvoicingOfferResponseToken(trimmed);
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingOfferResponseTokens)
      .where(eq(mysql.invoicingOfferResponseTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const offer = await getOfferById(row.tenantId, row.offerId);
    if (!offer) return null;
    return { tokenRow: mapTokenRow(row), offer };
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingOfferResponseTokens)
    .where(eq(pg.invoicingOfferResponseTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const offer = await getOfferById(row.tenantId, row.offerId);
  if (!offer) return null;
  return { tokenRow: mapTokenRow(row), offer };
};

/** Constant-time comparison of a presented token against a stored SHA-256 hash. */
export const offerResponseTokenMatches = (token: string, storedHash: string): boolean => {
  const hash = hashInvoicingOfferResponseToken(token);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};
