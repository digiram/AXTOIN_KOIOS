/** Tenant-scoped binary object storage (profile photos, workforce documents). */

export type BlobStorageContext = {
  tenantId: string;
};

export interface BlobStorage {
  write(relPath: string, body: Buffer, ctx: BlobStorageContext): Promise<void>;
  read(relPath: string, ctx: BlobStorageContext): Promise<Buffer>;
  delete(relPath: string): Promise<void>;
}
