/**
 * Helpers for opaque refresh tokens stored in the database.
 *
 * We never persist the raw refresh string — only a **SHA-256** digest so a DB leak does not directly
 * expose bearer refresh tokens. Compare only digests when validating `/auth/refresh`.
 */

import { createHash } from "node:crypto";

export const hashRefreshToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");
