/**
 * Mailbox message `body_text` / `body_html` at-rest encryption via SFENC1 middleware.
 * Legacy `SFMB1:` bodies are decrypted in {@link FieldEncryptionMiddleware}.
 */

import { encryptRowAtBoundary } from "./field-encryption/repo-boundary.js";
import { getFieldEncryptionMiddleware } from "./field-encryption/middleware.js";

const MESSAGES_TABLE_KEY = "mailbox_messages";

export const encryptMailboxBodiesAtRest = async (
  tenantId: string,
  messageId: string,
  bodies: { bodyText: string | null; bodyHtml: string | null }
): Promise<{ bodyText: string | null; bodyHtml: string | null }> => {
  if (!getFieldEncryptionMiddleware()) {
    return bodies;
  }
  const changedFields = new Set<string>();
  if (bodies.bodyText != null) changedFields.add("bodyText");
  if (bodies.bodyHtml != null) changedFields.add("bodyHtml");
  if (!changedFields.size) return bodies;
  const encrypted = await encryptRowAtBoundary(MESSAGES_TABLE_KEY, tenantId, bodies, {
    entityId: messageId,
    changedFields
  });
  return {
    bodyText: encrypted.bodyText === undefined ? bodies.bodyText : (encrypted.bodyText as string | null),
    bodyHtml: encrypted.bodyHtml === undefined ? bodies.bodyHtml : (encrypted.bodyHtml as string | null)
  };
};
