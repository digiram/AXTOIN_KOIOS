/**
 * Entity and employee document photo storage — `src/lib/entity-photo-storage.ts`.
 *
 * Asserts blob path layout, MIME validation, and local-fs round-trip at rest.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { resetBlobStorageForTests } from "../src/lib/blob-storage/index.js";
import {
  PROFILE_PHOTO_FILE_MAGIC,
  readEmployeeDocumentBytes,
  readProfilePhotoBytes,
  relPathForContactPhoto,
  relPathForEmployeeDocument,
  writeEmployeeDocumentFile,
  writeProfilePhotoFile
} from "../src/lib/entity-photo-storage.js";

describe("entity photo storage at rest", () => {
  const tenantId = "ddad2aa6-0a85-4b61-94d5-b6d586560c4f";
  const contactId = "79310e6b-9d22-44d7-bea5-fbbfbb7eda2e";
  let filesRoot = "";
  let prevKey: string | undefined;

  afterEach(async () => {
    process.env.FIELD_ENCRYPTION_KEY = prevKey;
    delete process.env.API_FILES_ROOT;
    resetBlobStorageForTests();
    if (filesRoot) await rm(filesRoot, { recursive: true, force: true });
    filesRoot = "";
  });

  it("encrypts new uploads when FIELD_ENCRYPTION_KEY is set", async () => {
    prevKey = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    filesRoot = await mkdtemp(join(tmpdir(), "starter-photo-"));
    process.env.API_FILES_ROOT = filesRoot;
    resetBlobStorageForTests();

    const plain = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const rel = relPathForContactPhoto(tenantId, contactId, "png");
    await writeProfilePhotoFile(filesRoot, rel, plain, { tenantId });

    const roundTrip = await readProfilePhotoBytes(filesRoot, rel, { tenantId });
    assert.deepEqual(roundTrip, plain);

    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(join(filesRoot, tenantId, "crm-contacts", `${contactId}.png`));
    assert.ok(onDisk.subarray(0, PROFILE_PHOTO_FILE_MAGIC.length).equals(PROFILE_PHOTO_FILE_MAGIC));
    assert.notDeepEqual(onDisk.subarray(PROFILE_PHOTO_FILE_MAGIC.length), plain);
  });

  it("allows plaintext uploads in dev when ALLOW_PLAINTEXT_BLOB_STORAGE is set", async () => {
    prevKey = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    process.env.ALLOW_PLAINTEXT_BLOB_STORAGE = "true";
    filesRoot = await mkdtemp(join(tmpdir(), "starter-photo-"));
    process.env.API_FILES_ROOT = filesRoot;
    resetBlobStorageForTests();

    const plain = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const rel = relPathForContactPhoto(tenantId, contactId, "png");
    await writeProfilePhotoFile(filesRoot, rel, plain, { tenantId });
    const roundTrip = await readProfilePhotoBytes(filesRoot, rel, { tenantId });
    assert.deepEqual(roundTrip, plain);
    delete process.env.ALLOW_PLAINTEXT_BLOB_STORAGE;
  });

  it("reads legacy plaintext files when no magic prefix is present", async () => {
    prevKey = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    filesRoot = await mkdtemp(join(tmpdir(), "starter-photo-"));
    process.env.API_FILES_ROOT = filesRoot;
    resetBlobStorageForTests();

    const plain = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const rel = relPathForContactPhoto(tenantId, contactId, "jpg");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(filesRoot, tenantId, "crm-contacts"), { recursive: true });
    await writeFile(join(filesRoot, tenantId, "crm-contacts", `${contactId}.jpg`), plain);

    const roundTrip = await readProfilePhotoBytes(filesRoot, rel, { tenantId });
    assert.deepEqual(roundTrip, plain);
  });
});

describe("employee document storage at rest", () => {
  const tenantId = "ddad2aa6-0a85-4b61-94d5-b6d586560c4f";
  const employeeId = "de50111b-7b6a-4bbe-97d4-2a3838eadc5a";
  const documentId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  let filesRoot = "";
  let prevKey: string | undefined;

  afterEach(async () => {
    process.env.FIELD_ENCRYPTION_KEY = prevKey;
    delete process.env.API_FILES_ROOT;
    resetBlobStorageForTests();
    if (filesRoot) await rm(filesRoot, { recursive: true, force: true });
    filesRoot = "";
  });

  it("encrypts employee documents when FIELD_ENCRYPTION_KEY is set", async () => {
    prevKey = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    filesRoot = await mkdtemp(join(tmpdir(), "starter-emp-doc-"));
    process.env.API_FILES_ROOT = filesRoot;
    resetBlobStorageForTests();

    const plain = Buffer.from("%PDF-1.4 encrypted doc test");
    const rel = relPathForEmployeeDocument(tenantId, employeeId, documentId, "pdf");
    await writeEmployeeDocumentFile(filesRoot, rel, plain, { tenantId });

    const roundTrip = await readEmployeeDocumentBytes(filesRoot, rel, { tenantId });
    assert.deepEqual(roundTrip, plain);

    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(
      join(filesRoot, tenantId, "workforce-employee-documents", employeeId, `${documentId}.pdf`)
    );
    assert.ok(onDisk.subarray(0, PROFILE_PHOTO_FILE_MAGIC.length).equals(PROFILE_PHOTO_FILE_MAGIC));
  });
});
