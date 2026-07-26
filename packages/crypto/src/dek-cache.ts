/**
 * In-memory LRU cache for decrypted tenant DEKs.
 *
 * Plaintext DEKs exist only in process memory; entries expire after TTL and are evicted under capacity.
 */

const DEFAULT_TTL_MS = 600_000;
const DEFAULT_MAX_ENTRIES = 512;

export type DekCacheEntry = {
  dek: Buffer;
  dekKeyVersion: number;
  expiresAt: number;
};

export type DekCacheOptions = {
  /** Entry TTL in milliseconds (default 600_000). */
  ttlMs?: number;
  /** Maximum cached tenants (default 512). */
  maxEntries?: number;
};

/** Reads DEK cache TTL from env. */
export const dekCacheTtlFromEnv = (): number => {
  const raw = process.env.FIELD_ENCRYPTION_DEK_CACHE_TTL_MS?.trim();
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
};

/**
 * LRU cache keyed by tenant id. Evicts expired entries on access and oldest when over capacity.
 */
export class DekCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  /** Insertion order = LRU (oldest first). */
  private readonly entries = new Map<string, DekCacheEntry>();

  constructor(opts: DekCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? dekCacheTtlFromEnv();
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get(tenantId: string): DekCacheEntry | undefined {
    this.evictExpired();
    const entry = this.entries.get(tenantId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.zeroAndDelete(tenantId);
      return undefined;
    }
    // LRU bump
    this.entries.delete(tenantId);
    this.entries.set(tenantId, entry);
    return entry;
  }

  set(tenantId: string, dek: Buffer, dekKeyVersion: number): void {
    this.evictExpired();
    if (this.entries.has(tenantId)) {
      this.zeroAndDelete(tenantId);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.zeroAndDelete(oldest);
    }
    this.entries.set(tenantId, {
      dek: Buffer.from(dek),
      dekKeyVersion,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  delete(tenantId: string): void {
    this.zeroAndDelete(tenantId);
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) {
      this.zeroAndDelete(key);
    }
  }

  size(): number {
    this.evictExpired();
    return this.entries.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.zeroAndDelete(id);
      }
    }
  }

  private zeroAndDelete(tenantId: string): void {
    const entry = this.entries.get(tenantId);
    if (entry) {
      entry.dek.fill(0);
    }
    this.entries.delete(tenantId);
  }
}

export { DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES };
