/**
 * Structured security audit events — log only non-secret metadata (no passwords/tokens).
 */

export type SecurityAuditEvent = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  tenantId?: string | null;
  requestId?: string;
  outcome?: string;
  detail?: Record<string, string | number | boolean | null>;
};

type AuditLogger = {
  info: (obj: object, msg?: string) => void;
};

export type { AuditLogger };

export const logSecurityEvent = (log: AuditLogger | undefined, event: SecurityAuditEvent): void => {
  log?.info(
    {
      securityAudit: true,
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      targetUserId: event.targetUserId ?? null,
      tenantId: event.tenantId ?? null,
      requestId: event.requestId ?? null,
      outcome: event.outcome ?? "ok",
      ...(event.detail ?? {})
    },
    `security:${event.action}`
  );
};
