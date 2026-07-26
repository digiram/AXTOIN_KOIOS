/**
 * Blind search indexes — normalized n-gram tokens hashed with HMAC-SHA256.
 *
 * Search key material comes from {@link searchIndexKeyFromEnv} (derived from
 * `FIELD_ENCRYPTION_KEY` by default, or an explicit `SEARCH_INDEX_KEY` override).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_NGRAM_SIZE = 3;

/** Normalizes searchable text: trim, lowercase, strip accents, collapse whitespace. */
export const normalizeSearchText = (raw: string): string => {
  const trimmed = raw.trim().toLowerCase();
  const nfd = trimmed.normalize("NFD").replace(/\p{M}/gu, "");
  return nfd.replace(/\s+/g, " ");
};

/** Generates character n-grams from normalized text (padded for short strings). */
export const generateNgrams = (normalized: string, ngramSize: number = DEFAULT_NGRAM_SIZE): string[] => {
  if (normalized.length === 0) return [];
  const n = Math.max(1, ngramSize);
  const padded =
    normalized.length < n ? normalized.padEnd(n, " ") : normalized;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - n; i++) {
    grams.add(padded.slice(i, i + n));
  }
  return [...grams];
};

export type BlindIndexContext = {
  tenantId: string;
  table: string;
  field: string;
};

const decodeSearchKey = (searchKeyB64: string): Buffer => {
  const key = Buffer.from(searchKeyB64, "base64");
  if (key.byteLength !== 32) {
    throw new Error("Search index key must decode to 32 bytes");
  }
  return key;
};

const hmacMaterial = (ctx: BlindIndexContext, token: string): string =>
  `${ctx.tenantId}\0${ctx.table}\0${ctx.field}\0${token}`;

/** Computes HMAC-SHA256 hex digest for a single search token. */
export const hashSearchToken = (
  ctx: BlindIndexContext,
  token: string,
  searchKeyB64: string
): string => {
  const key = decodeSearchKey(searchKeyB64);
  return createHmac("sha256", key).update(hmacMaterial(ctx, token), "utf8").digest("hex");
};

/** Full-value equality token (normalized entire string). */
export const equalityToken = (normalized: string): string => `=${normalized}`;

/** Prefix/autocomplete tokens — leading n-grams only. */
export const prefixTokens = (normalized: string, ngramSize: number = DEFAULT_NGRAM_SIZE): string[] => {
  if (normalized.length === 0) return [];
  const n = Math.max(1, ngramSize);
  const tokens: string[] = [];
  const maxLen = Math.min(normalized.length, n * 3);
  for (let len = 1; len <= maxLen; len++) {
    const slice = normalized.slice(0, len);
    if (slice.length >= n) {
      tokens.push(slice.slice(0, n));
    } else {
      tokens.push(slice.padEnd(n, " "));
    }
  }
  return [...new Set(tokens)];
};

export type SearchTokenSet = {
  /** All n-gram hashes for contains/fuzzy. */
  ngramHashes: string[];
  /** Equality hash (full normalized value). */
  equalityHash: string | null;
  /** Prefix n-gram hashes for autocomplete. */
  prefixHashes: string[];
};

/** Builds all blind-index token hashes for a plaintext field value. */
export const buildSearchTokenSet = (
  plaintext: string,
  ctx: BlindIndexContext,
  searchKeyB64: string,
  ngramSize: number = DEFAULT_NGRAM_SIZE
): SearchTokenSet => {
  const normalized = normalizeSearchText(plaintext);
  if (normalized.length === 0) {
    return { ngramHashes: [], equalityHash: null, prefixHashes: [] };
  }
  const ngrams = generateNgrams(normalized, ngramSize);
  const ngramHashes = ngrams.map((t) => hashSearchToken(ctx, t, searchKeyB64));
  const equalityHash = hashSearchToken(ctx, equalityToken(normalized), searchKeyB64);
  const prefixHashes = prefixTokens(normalized, ngramSize).map((t) =>
    hashSearchToken(ctx, t, searchKeyB64)
  );
  return { ngramHashes, equalityHash, prefixHashes };
};

/** Builds query token hashes for a search string (contains mode). */
export const buildContainsQueryHashes = (
  query: string,
  ctx: BlindIndexContext,
  searchKeyB64: string,
  ngramSize: number = DEFAULT_NGRAM_SIZE
): string[] => {
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) return [];
  return generateNgrams(normalized, ngramSize).map((t) => hashSearchToken(ctx, t, searchKeyB64));
};

/** Builds query hash for exact equality search. */
export const buildEqualityQueryHash = (
  query: string,
  ctx: BlindIndexContext,
  searchKeyB64: string
): string | null => {
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) return null;
  return hashSearchToken(ctx, equalityToken(normalized), searchKeyB64);
};

/** Builds prefix/autocomplete query hashes. */
export const buildPrefixQueryHashes = (
  query: string,
  ctx: BlindIndexContext,
  searchKeyB64: string,
  ngramSize: number = DEFAULT_NGRAM_SIZE
): string[] => {
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) return [];
  return prefixTokens(normalized, ngramSize).map((t) => hashSearchToken(ctx, t, searchKeyB64));
};

/**
 * Fuzzy match score: Jaccard similarity of query vs candidate n-gram hash sets.
 * Returns 0..1; caller chooses threshold (e.g. 0.5).
 */
export const fuzzyMatchScore = (queryHashes: string[], candidateHashes: string[]): number => {
  if (queryHashes.length === 0 || candidateHashes.length === 0) return 0;
  const qSet = new Set(queryHashes);
  const cSet = new Set(candidateHashes);
  let intersection = 0;
  for (const h of qSet) {
    if (cSet.has(h)) intersection++;
  }
  const union = qSet.size + cSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

/** Constant-time comparison of two hex HMAC digests. */
export const secureCompareTokenHash = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length !== 64) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};

/** Reads n-gram size from env (default 3). */
export const ngramSizeFromEnv = (): number => {
  const raw = process.env.FIELD_ENCRYPTION_NGRAM_SIZE?.trim();
  if (!raw) return DEFAULT_NGRAM_SIZE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : DEFAULT_NGRAM_SIZE;
};

export { DEFAULT_NGRAM_SIZE };
