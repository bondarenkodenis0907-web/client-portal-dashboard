// Restore a recorded synthetic backup without starting or connecting to its source.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  root,
  restoreDir,
  prepareTarget,
  ownerCheck,
  assertTargetContainer,
  cli,
  command,
  startTarget,
  stopTarget,
  queryLocalDatabase,
} from "./restore-target.mjs";
import { projectId } from "./local-tests.mjs";
import { readBundle } from "./backup-crypto.mjs";
import { sha256 } from "./backup-safety.mjs";
import {
  inventory,
  recoverFiles,
  cleanup,
  probes,
  restoredSqlTestCount,
  restoredSqlTestPaths,
} from "./restore-drill.mjs";
import { replaceEmptyRestoreEnvironment } from "./restore-preflight.mjs";

export async function restoreSavedBackup(runId, ephemeralKey) {
  if (!/^[0-9a-f-]{36}$/.test(runId ?? ""))
    throw Error("Use a recorded synthetic backup run ID");
  const directory = join(root, ".local-backups", runId);
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json")));
  assert.equal(manifest.context, `${projectId}/${runId}`);
  const bundle = readBundle(directory, manifest, ephemeralKey);
  assert.equal(sha256(Buffer.from(bundle.dump, "base64")), manifest.dumpHash);
  for (const name of [
    "supabase/test.config.toml",
    "supabase/templates/recovery.html",
  ])
    assert.equal(
      sha256(readFileSync(join(root, name))),
      bundle.fileHashes[name],
      "Restore configuration differs from the archived revision",
    );
  const started = performance.now();
  const report = {
    runId,
    createdAt: new Date().toISOString(),
    result: "FAIL",
    sourceStartedOrConnected: false,
    productionChanged: false,
  };
  let status,
    imported = false;
  try {
    prepareTarget();
    ownerCheck();
    stopTarget();
    // DB-only bootstrap also works after a failed import left an empty database.
    cli(restoreDir, [
      "start",
      "--exclude",
      "gotrue,postgrest,kong,mailpit,studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor",
    ]);
    const container = assertTargetContainer();
    assert.equal(
      command("docker", ["inspect", container, "--format", "{{.Image}}"]),
      manifest.image,
    );
    const sql = (text, db) => queryLocalDatabase(container, text, db);
    report.projectFilesVerified = recoverFiles(bundle, runId);
    replaceEmptyRestoreEnvironment(sql, () =>
      sql(
        "DROP DATABASE postgres WITH (FORCE);\nCREATE DATABASE postgres OWNER postgres TEMPLATE template0;\n",
        "template1",
      ),
    );
    command(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "--single-transaction",
        "--exit-on-error",
      ],
      { input: Buffer.from(bundle.dump, "base64") },
    );
    imported = true;
    const current = inventory(container);
    for (const name of Object.keys(bundle.inventory))
      assert.equal(
        sha256(JSON.stringify(current[name])),
        sha256(JSON.stringify(bundle.inventory[name])),
        `Restored inventory mismatch: ${name}`,
      );
    report.inventoryEqual = true;
    sql("TRUNCATE auth.refresh_tokens, auth.sessions CASCADE;");
    stopTarget();
    status = startTarget();
    report.probes = await probes(status, bundle.fixture);
    await cleanup(status, bundle.fixture);
    mkdirSync(join(restoreDir, "supabase/tests"), { recursive: true });
    const testNames = restoredSqlTestPaths(bundle.files);
    for (const name of testNames)
      writeFileSync(
        join(restoreDir, name),
        Buffer.from(bundle.files[name], "base64"),
      );
    const tests = cli(restoreDir, [
      "test",
      "db",
      "--local",
      ...testNames.map((name) => join(restoreDir, name)),
    ]);
    const expectedTests = restoredSqlTestCount(bundle.files);
    assert.equal(Number(/Tests=(\d+)/.exec(tests)?.[1]), expectedTests);
    report.sqlRegressionTests = expectedTests;
    report.result = "PASS";
  } finally {
    try {
      if (imported)
        await cleanup(
          status ?? { API_URL: "http://127.0.0.1:57321" },
          bundle.fixture,
        );
      report.cleaned = true;
    } catch {
      report.cleaned = false;
      report.result = "FAIL";
    }
    try {
      stopTarget();
      report.stopped = true;
    } catch {
      report.stopped = false;
      report.result = "FAIL";
    }
    report.seconds = (performance.now() - started) / 1000;
    writeFileSync(
      join(directory, "independent-restore-report.json"),
      JSON.stringify(report, null, 2),
    );
  }
  if (report.result !== "PASS")
    throw Error("Independent restore cleanup or shutdown failed");
  console.log(
    `PASS: independent restore of ${runId}; source was not started or connected.`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  restoreSavedBackup(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
