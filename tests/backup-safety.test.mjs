import assert from "node:assert/strict";
import test from "node:test";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  restoreIdentity,
  assertRestoreOwner,
  assertLocalRestoreStatus,
  assertBackupPath,
  sealBackup,
  openBackup,
} from "../scripts/backup-safety.mjs";

test("restore mutations require this checkout's owner, exact local ports and no hosted link", () => {
  const root = resolve("fixture-checkout");
  const projectId = restoreIdentity(root);
  const config = `project_id = "${projectId}"\n[api]\nport = 57321\n[db]\nport = 57322\n`;
  const owner = { root, projectId };
  assert.doesNotThrow(() => assertRestoreOwner(owner, root, config, false));
  assert.throws(() => assertRestoreOwner(owner, root, config, true));
  assert.throws(() =>
    assertRestoreOwner(
      { ...owner, root: resolve("other") },
      root,
      config,
      false,
    ),
  );
  assert.throws(() =>
    assertRestoreOwner(
      { ...owner, projectId: "client-portal-dashboard" },
      root,
      config,
      false,
    ),
  );
  assert.throws(() =>
    assertRestoreOwner(owner, root, config.replace("57321", "573210"), false),
  );
  assert.throws(() =>
    assertRestoreOwner(owner, root, config.replace("57322", "55322"), false),
  );
});
test("restore APIs reject source, development, production and ambiguous hosts", () => {
  const valid = {
    API_URL: "http://127.0.0.1:57321",
    DB_URL: "postgresql://local:fake@127.0.0.1:57322/postgres",
    PUBLISHABLE_KEY: "fake",
    SECRET_KEY: "fake",
  };
  assert.doesNotThrow(() => assertLocalRestoreStatus(valid));
  for (const API_URL of [
    "https://example.supabase.co",
    "http://localhost:57321",
    "http://127.0.0.1:56321",
    "http://127.0.0.1:55321",
  ])
    assert.throws(() => assertLocalRestoreStatus({ ...valid, API_URL }));
  assert.throws(() =>
    assertLocalRestoreStatus({
      ...valid,
      DB_URL: "postgresql://local:fake@127.0.0.1:56322/postgres",
    }),
  );
  assert.throws(() =>
    assertLocalRestoreStatus({ ...valid, SECRET_KEY: undefined }),
  );
});
test("archive paths cannot escape the owned backup directory", () => {
  const base = resolve("backups");
  assert.doesNotThrow(() =>
    assertBackupPath(base, join(base, "run", "backup.aes-gcm")),
  );
  assert.throws(() => assertBackupPath(base, base));
  assert.throws(() =>
    assertBackupPath(base, resolve(base, "..", "production.sql")),
  );
  assert.throws(() => assertBackupPath(base, base + "-sibling/backup"));
});
test("encrypted backup authenticates the archive, key, tag and restore context", () => {
  const key = randomBytes(32);
  const plaintext = Buffer.from("synthetic backup with private Auth material");
  const context = "dedicated-project/run-id";
  const sealed = sealBackup(plaintext, key, context);
  assert.deepEqual(openBackup(sealed, key, context), plaintext);
  assert.ok(!sealed.includes(plaintext));
  assert.throws(() => openBackup(sealed, randomBytes(32), context));
  assert.throws(() => openBackup(sealed, key, "another-run"));
  for (const field of ["ciphertext", "tag"]) {
    const changed = JSON.parse(sealed.toString());
    const bytes = Buffer.from(changed[field], "base64");
    bytes[0] ^= 1;
    changed[field] = bytes.toString("base64");
    assert.throws(() =>
      openBackup(Buffer.from(JSON.stringify(changed)), key, context),
    );
  }
});
