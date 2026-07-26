/**
 * Platform-wide mail templates (stored HTML) & SMTP settings (super-admin managed).
 */

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import { decryptSecretAtBoundary, encryptSecretAtBoundary } from "./field-encryption/secret-boundary.js";
import { openPlatformSmtpRow, sealPlatformSmtpFields } from "./field-encryption/platform-smtp-boundary.js";

const TENANT_SMTP_TABLE_KEY = "tenant_smtp_settings";
const PLATFORM_SMTP_TABLE_KEY = "platform_smtp_settings";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

/** Fixed primary key for the singleton SMTP configuration row. */
export const PLATFORM_SMTP_ROW_ID = "00000000-0000-0000-0000-000000000001";

export const sealTenantSmtpPasswordAtRest = async (
  tenantId: string,
  plaintext: string
): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: TENANT_SMTP_TABLE_KEY,
    tenantId,
    fieldName: "passwordEncrypted",
    plaintext
  });

export const sealPlatformSmtpPasswordAtRest = async (plaintext: string): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: PLATFORM_SMTP_TABLE_KEY,
    tenantId: null,
    fieldName: "passwordEncrypted",
    plaintext
  });

export const openTenantSmtpPasswordAtRest = async (tenantId: string, stored: string): Promise<string> =>
  decryptSecretAtBoundary({
    tableKey: TENANT_SMTP_TABLE_KEY,
    tenantId,
    fieldName: "passwordEncrypted",
    stored
  });

export const openPlatformSmtpPasswordAtRest = async (stored: string): Promise<string> =>
  decryptSecretAtBoundary({
    tableKey: PLATFORM_SMTP_TABLE_KEY,
    tenantId: null,
    fieldName: "passwordEncrypted",
    stored
  });

/** Default welcome message HTML (matches migration seed). */
export const DEFAULT_WELCOME_BODY_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f5f5f5;color:#242424;"><p style="max-width:560px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">Welcome — thanks for joining.</p></body></html>';

export type PlatformEmailTemplateSummary = {
  templateKey: string;
  displayName: string;
  subject: string | null;
  updatedAt: Date;
};

export type PlatformEmailTemplateDetail = PlatformEmailTemplateSummary & {
  bodyHtml: string;
};

export type PlatformSmtpRow = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  passwordEncrypted: string | null;
  fromName: string;
  fromEmail: string;
  smtpEnabled: boolean;
  updatedAt: Date;
};

export type TenantSmtpRow = Omit<PlatformSmtpRow, "id"> & { tenantId: string };

export type EffectiveSmtpSource = "tenant" | "platform";

/** Tenant row counts as configured only when host and from email are both non-empty. */
export const isTenantSmtpConfigured = (row: TenantSmtpRow | undefined): boolean =>
  Boolean(row?.host.trim() && row.fromEmail.trim());

const mapTenantSmtpRow = (row: {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  passwordEncrypted: string | null;
  fromName: string;
  fromEmail: string;
  smtpEnabled: boolean;
  updatedAt: Date;
}): TenantSmtpRow => ({
  tenantId: row.tenantId,
  host: row.host,
  port: row.port,
  secure: row.secure,
  username: row.username,
  passwordEncrypted: row.passwordEncrypted,
  fromName: row.fromName,
  fromEmail: row.fromEmail,
  smtpEnabled: Boolean(row.smtpEnabled),
  updatedAt: row.updatedAt
});

export const getTenantSmtpSettingsRow = async (tenantId: string): Promise<TenantSmtpRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.tenantSmtpSettings)
      .where(eq(mysql.tenantSmtpSettings.tenantId, tenantId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return mapTenantSmtpRow({
      tenantId: row.tenantId,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      passwordEncrypted: row.passwordEncrypted,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      smtpEnabled: row.smtpEnabled,
      updatedAt: row.updatedAt
    });
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.tenantSmtpSettings)
    .where(eq(pg.tenantSmtpSettings.tenantId, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return mapTenantSmtpRow({
    tenantId: row.tenantId,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    passwordEncrypted: row.passwordEncrypted,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    smtpEnabled: row.smtpEnabled,
    updatedAt: row.updatedAt
  });
};

export const upsertTenantSmtpSettingsRow = async (
  tenantId: string,
  input: {
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    /** Pass `undefined` to leave unchanged; `null` or empty string to clear encrypted password. */
    passwordEncrypted?: string | null;
    fromName: string;
    fromEmail: string;
    smtpEnabled: boolean;
  }
): Promise<void> => {
  const existing = await getTenantSmtpSettingsRow(tenantId);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!existing) {
      await db.insert(mysql.tenantSmtpSettings).values({
        tenantId,
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        passwordEncrypted: input.passwordEncrypted === undefined ? null : input.passwordEncrypted,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        smtpEnabled: input.smtpEnabled,
        updatedAt: new Date()
      });
      return;
    }
    await db
      .update(mysql.tenantSmtpSettings)
      .set({
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        smtpEnabled: input.smtpEnabled,
        ...(input.passwordEncrypted !== undefined ? { passwordEncrypted: input.passwordEncrypted } : {}),
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        updatedAt: new Date()
      })
      .where(eq(mysql.tenantSmtpSettings.tenantId, tenantId));
    return;
  }

  const db = pgDb();
  if (!existing) {
    await db.insert(pg.tenantSmtpSettings).values({
      tenantId,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      passwordEncrypted: input.passwordEncrypted === undefined ? null : input.passwordEncrypted,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      smtpEnabled: input.smtpEnabled,
      updatedAt: new Date()
    });
    return;
  }
  await db
    .update(pg.tenantSmtpSettings)
    .set({
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      smtpEnabled: input.smtpEnabled,
      ...(input.passwordEncrypted !== undefined ? { passwordEncrypted: input.passwordEncrypted } : {}),
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      updatedAt: new Date()
    })
    .where(eq(pg.tenantSmtpSettings.tenantId, tenantId));
};

/** Tenant custom SMTP when configured; otherwise platform singleton row. */
export const resolveEffectiveSmtpForTenant = async (
  tenantId: string
): Promise<{ row: PlatformSmtpRow | undefined; source: EffectiveSmtpSource }> => {
  const tenantRow = await getTenantSmtpSettingsRow(tenantId);
  if (tenantRow && isTenantSmtpConfigured(tenantRow)) {
    return {
      row: {
        id: tenantRow.tenantId,
        host: tenantRow.host,
        port: tenantRow.port,
        secure: tenantRow.secure,
        username: tenantRow.username,
        passwordEncrypted: tenantRow.passwordEncrypted,
        fromName: tenantRow.fromName,
        fromEmail: tenantRow.fromEmail,
        smtpEnabled: tenantRow.smtpEnabled,
        updatedAt: tenantRow.updatedAt
      },
      source: "tenant"
    };
  }
  const platformRow = await getPlatformSmtpSettingsRow();
  return { row: platformRow, source: "platform" };
};

export const listPlatformEmailTemplates = async (): Promise<PlatformEmailTemplateSummary[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        templateKey: mysql.platformEmailTemplates.templateKey,
        displayName: mysql.platformEmailTemplates.displayName,
        subject: mysql.platformEmailTemplates.subject,
        updatedAt: mysql.platformEmailTemplates.updatedAt
      })
      .from(mysql.platformEmailTemplates)
      .orderBy(asc(mysql.platformEmailTemplates.templateKey));
    return rows.map((r) => ({
      templateKey: r.templateKey,
      displayName: r.displayName,
      subject: r.subject,
      updatedAt: r.updatedAt
    }));
  }
  const db = pgDb();
  const rows = await db
    .select({
      templateKey: pg.platformEmailTemplates.templateKey,
      displayName: pg.platformEmailTemplates.displayName,
      subject: pg.platformEmailTemplates.subject,
      updatedAt: pg.platformEmailTemplates.updatedAt
    })
    .from(pg.platformEmailTemplates)
    .orderBy(asc(pg.platformEmailTemplates.templateKey));
  return rows.map((r) => ({
    templateKey: r.templateKey,
    displayName: r.displayName,
    subject: r.subject,
    updatedAt: r.updatedAt
  }));
};

export const getPlatformEmailTemplateByKey = async (
  templateKey: string
): Promise<PlatformEmailTemplateDetail | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformEmailTemplates)
      .where(eq(mysql.platformEmailTemplates.templateKey, templateKey))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      templateKey: row.templateKey,
      displayName: row.displayName,
      subject: row.subject,
      updatedAt: row.updatedAt,
      bodyHtml: row.bodyHtml
    };
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformEmailTemplates)
    .where(eq(pg.platformEmailTemplates.templateKey, templateKey))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    templateKey: row.templateKey,
    displayName: row.displayName,
    subject: row.subject,
    updatedAt: row.updatedAt,
    bodyHtml: row.bodyHtml
  };
};

export const upsertPlatformEmailTemplate = async (input: {
  templateKey: string;
  displayName: string;
  subject?: string | null;
  bodyHtml: string;
}): Promise<void> => {
  const subject = input.subject ?? null;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await db
      .select({ id: mysql.platformEmailTemplates.id })
      .from(mysql.platformEmailTemplates)
      .where(eq(mysql.platformEmailTemplates.templateKey, input.templateKey))
      .limit(1);
    if (existing[0]) {
      await db
        .update(mysql.platformEmailTemplates)
        .set({
          displayName: input.displayName,
          subject,
          bodyHtml: input.bodyHtml,
          updatedAt: new Date()
        })
        .where(eq(mysql.platformEmailTemplates.templateKey, input.templateKey));
      return;
    }
    await db.insert(mysql.platformEmailTemplates).values({
      id: randomUUID(),
      templateKey: input.templateKey,
      displayName: input.displayName,
      subject,
      bodyHtml: input.bodyHtml,
      updatedAt: new Date()
    });
    return;
  }

  const db = pgDb();
  const existing = await db
    .select({ id: pg.platformEmailTemplates.id })
    .from(pg.platformEmailTemplates)
    .where(eq(pg.platformEmailTemplates.templateKey, input.templateKey))
    .limit(1);
  if (existing[0]) {
    await db
      .update(pg.platformEmailTemplates)
      .set({
        displayName: input.displayName,
        subject,
        bodyHtml: input.bodyHtml,
        updatedAt: new Date()
      })
      .where(eq(pg.platformEmailTemplates.templateKey, input.templateKey));
    return;
  }
  await db.insert(pg.platformEmailTemplates).values({
    templateKey: input.templateKey,
    displayName: input.displayName,
    subject,
    bodyHtml: input.bodyHtml,
    updatedAt: new Date()
  });
};

export const getPlatformSmtpSettingsRow = async (): Promise<PlatformSmtpRow | undefined> => {
  const mapPlain = (row: {
    id: string;
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    passwordEncrypted: string | null;
    fromName: string;
    fromEmail: string;
    smtpEnabled: boolean | number;
    updatedAt: Date;
  }): PlatformSmtpRow => ({
    id: row.id,
    host: row.host,
    port: row.port,
    secure: Boolean(row.secure),
    username: row.username,
    passwordEncrypted: row.passwordEncrypted,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    smtpEnabled: Boolean(row.smtpEnabled),
    updatedAt: row.updatedAt
  });

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformSmtpSettings)
      .where(eq(mysql.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const plain = await openPlatformSmtpRow(row as Record<string, unknown>);
    return mapPlain(plain as typeof row);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformSmtpSettings)
    .where(eq(pg.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const plain = await openPlatformSmtpRow(row as Record<string, unknown>);
  return mapPlain(plain as typeof row);
};

export const upsertPlatformSmtpSettingsRow = async (input: {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  /** Pass `undefined` to leave unchanged; `null` or empty string to clear encrypted password. */
  passwordEncrypted?: string | null;
  fromName: string;
  fromEmail: string;
  smtpEnabled: boolean;
}): Promise<void> => {
  const existingRow = dialectFromEnv() === "mysql"
    ? (await mysqlDb().select().from(mysql.platformSmtpSettings).where(eq(mysql.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID)).limit(1))[0]
    : (await pgDb().select().from(pg.platformSmtpSettings).where(eq(pg.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID)).limit(1))[0];

  const sealed = await sealPlatformSmtpFields(
    { host: input.host, username: input.username ?? null },
    PLATFORM_SMTP_ROW_ID,
    new Set(["host", "username"])
  );
  const hostStored = String(sealed.host ?? input.host);
  const usernameStored = (sealed.username as string | null | undefined) ?? input.username ?? null;
  const passwordStored =
    input.passwordEncrypted !== undefined ? input.passwordEncrypted : undefined;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!existingRow) {
      await db.insert(mysql.platformSmtpSettings).values({
        id: PLATFORM_SMTP_ROW_ID,
        host: hostStored,
        port: input.port,
        secure: input.secure,
        username: usernameStored,
        passwordEncrypted: passwordStored === undefined ? null : passwordStored,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        smtpEnabled: input.smtpEnabled,
        updatedAt: new Date()
      });
      return;
    }
    await db
      .update(mysql.platformSmtpSettings)
      .set({
        host: hostStored,
        port: input.port,
        secure: input.secure,
        username: usernameStored,
        smtpEnabled: input.smtpEnabled,
        ...(passwordStored !== undefined ? { passwordEncrypted: passwordStored } : {}),
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        updatedAt: new Date()
      })
      .where(eq(mysql.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID));
    return;
  }

  const db = pgDb();
  if (!existingRow) {
    await db.insert(pg.platformSmtpSettings).values({
      id: PLATFORM_SMTP_ROW_ID,
      host: hostStored,
      port: input.port,
      secure: input.secure,
      username: usernameStored,
      passwordEncrypted: passwordStored === undefined ? null : passwordStored,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      smtpEnabled: input.smtpEnabled,
      updatedAt: new Date()
    });
    return;
  }
  await db
    .update(pg.platformSmtpSettings)
    .set({
      host: hostStored,
      port: input.port,
      secure: input.secure,
      username: usernameStored,
      smtpEnabled: input.smtpEnabled,
      ...(passwordStored !== undefined ? { passwordEncrypted: passwordStored } : {}),
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      updatedAt: new Date()
    })
    .where(eq(pg.platformSmtpSettings.id, PLATFORM_SMTP_ROW_ID));
};

/** Inserts default welcome template and SMTP row when tables are empty / missing. Idempotent. */
export const ensurePlatformMailSeed = async (): Promise<void> => {
  const templates = await listPlatformEmailTemplates();
  if (templates.length === 0) {
    await upsertPlatformEmailTemplate({
      templateKey: "welcome",
      displayName: "Welcome email",
      subject: "Welcome",
      bodyHtml: DEFAULT_WELCOME_BODY_HTML
    });
  }
  const smtp = await getPlatformSmtpSettingsRow();
  if (!smtp) {
    await upsertPlatformSmtpSettingsRow({
      host: "",
      port: 587,
      secure: false,
      username: null,
      passwordEncrypted: null,
      fromName: "",
      fromEmail: "",
      smtpEnabled: true
    });
  }
};
