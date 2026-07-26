/**
 * Structured audit logging for field decrypt operations.
 *
 * Never logs plaintext values or key material.
 */

export type FieldDecryptAuditEvent = {
  timestamp: string;
  tenantId: string | null;
  entityTable: string;
  entityId: string;
  field: string;
  userId?: string | null;
  traceId?: string | null;
  event: "field_decrypt";
};

export type FieldDecryptAuditLogger = {
  info: (event: FieldDecryptAuditEvent, message: string) => void;
};

/** No-op logger for tests and disabled audit paths. */
export const noopFieldDecryptAuditLogger: FieldDecryptAuditLogger = {
  info: () => {}
};

/**
 * Logs a field decrypt audit event. Callers supply a logger adapter (e.g. Pino child).
 */
export const logFieldDecrypt = (
  logger: FieldDecryptAuditLogger,
  input: Omit<FieldDecryptAuditEvent, "timestamp" | "event"> & { timestamp?: string }
): void => {
  logger.info(
    {
      timestamp: input.timestamp ?? new Date().toISOString(),
      tenantId: input.tenantId,
      entityTable: input.entityTable,
      entityId: input.entityId,
      field: input.field,
      userId: input.userId ?? null,
      traceId: input.traceId ?? null,
      event: "field_decrypt"
    },
    "field decrypt"
  );
};
