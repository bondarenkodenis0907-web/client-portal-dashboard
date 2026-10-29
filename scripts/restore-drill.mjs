import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { runLocal, projectId, assertTestStatus } from "./local-tests.mjs";
import {
  root,
  restoreDir,
  restoreId,
  command,
  cli,
  startTarget,
  targetStatus,
  assertTargetContainer,
  stopTarget,
  queryLocalDatabase as sql,
} from "./restore-target.mjs";
import { assertBackupPath, sha256, sealBackup } from "./backup-safety.mjs";
import { saveBundle, readBundle } from "./backup-crypto.mjs";
import {
  assertEmptyRestoreEnvironment,
  replaceEmptyRestoreEnvironment,
} from "./restore-preflight.mjs";

const backupBase = join(root, ".local-backups");
const sourceContainer = `supabase_db_${projectId}`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
function api(status, admin = false) {
  if (
    !["http://127.0.0.1:56321", "http://127.0.0.1:57321"].includes(
      status.API_URL,
    )
  )
    throw Error("Only dedicated loopback APIs are allowed");
  return createClient(
    status.API_URL,
    admin ? status.SECRET_KEY : status.PUBLISHABLE_KEY,
    options,
  );
}
export function inventory(container) {
  return JSON.parse(
    sql(
      container,
      readFileSync(join(root, "scripts/restore-inventory.sql"), "utf8"),
    ),
  );
}
const fingerprint = (object) => sha256(JSON.stringify(object));
function filesForBackup() {
  const names = [
    ...new Set(
      command("git", ["ls-files", "-z", "-co", "--exclude-standard"]).split(
        "\0",
      ),
    ),
  ];
  const result = {};
  for (const name of names) {
    if (
      !name ||
      /(^|\/)(\.env[^/]*|\.git|\.codex|\.aws)|\.(pem|key)$/i.test(name)
    )
      continue;
    if (
      !/^(src\/|docs\/|scripts\/|supabase\/|tests\/|public\/|\.github\/|README\.md$|package(-lock)?\.json$|\.node-version$|\.gitignore$|\.gitattributes$|.*config\.(ts|mjs|json)$|\.prettier)/.test(
        name,
      )
    )
      continue;
    const path = join(root, name);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) continue;
    assertBackupPath(root, path);
    if (entry.isSymbolicLink()) throw Error("Symlink in backup input");
    result[name] = readFileSync(path).toString("base64");
  }
  return result;
}
export function recoverFiles(bundle, directory) {
  const target = join(restoreDir, "recovered-project", directory);
  mkdirSync(target, { recursive: true });
  let checked = 0;
  for (const [name, encoded] of Object.entries(bundle.files)) {
    if (
      name.includes("\\") ||
      name.split("/").includes("..") ||
      name.startsWith("/")
    )
      throw Error("Unsafe archive path");
    const path = join(target, name);
    assertBackupPath(target, path);
    mkdirSync(resolve(path, ".."), { recursive: true });
    const value = Buffer.from(encoded, "base64");
    writeFileSync(path, value);
    assert.equal(sha256(readFileSync(path)), bundle.fileHashes[name]);
    checked++;
  }
  return checked;
}
async function seed(status, fixture) {
  const admin = api(status, true);
  for (let index = 0; index < 4; index++) {
    const email = `restore-${index}-${randomUUID()}@example.test`;
    const made = await admin.auth.admin.createUser({
      email,
      password: fixture.password,
      email_confirm: true,
    });
    if (made.error || !made.data.user)
      throw Error("Synthetic account creation failed");
    fixture.users.push({ id: made.data.user.id, email });
  }
  const staff = await admin.from("service_staff").insert([
    { user_id: fixture.users[2].id, display_name: "Restore Engineer — active" },
    {
      user_id: fixture.users[3].id,
      display_name: "Restore Engineer — inactive",
    },
  ]);
  if (staff.error) throw Error("Synthetic directory creation failed");
  const clients = await loginAll(status, fixture);
  for (let index = 0; index < 3; index++) {
    const made = await clients[index === 2 ? 1 : 0]
      .rpc("create_service_request", {
        p_operation_key: randomUUID(),
        p_site: `Restore object ${index}`,
        p_system: "CCTV",
        p_description: "Синтетическая проверка восстановления — камера",
        p_priority: "medium",
      })
      .single();
    if (made.error) throw Error("Synthetic request creation failed");
    fixture.requestIds.push(made.data.id);
    if (index > 0) {
      const started = await clients[2].rpc("process_service_request", {
        p_request_id: made.data.id,
        p_expected_version: 1,
        p_assigned_to: fixture.users[index === 1 ? 2 : 3].id,
        p_status: "in_progress",
        p_resolution: "",
      });
      if (started.error) throw Error("Synthetic request start failed");
      if (index === 1) {
        const closed = await clients[2].rpc("process_service_request", {
          p_request_id: made.data.id,
          p_expected_version: 2,
          p_assigned_to: fixture.users[2].id,
          p_status: "closed",
          p_resolution: "Разъём заменён, запись и изображение проверены.",
        });
        if (closed.error) throw Error("Synthetic request closure failed");
      }
    }
  }
  const inactive = await admin
    .from("service_staff")
    .update({ is_active: false })
    .eq("user_id", fixture.users[3].id);
  if (inactive.error) throw Error("Synthetic deactivation failed");
  return { fixture, clients };
}
async function loginAll(status, fixture) {
  const clients = [];
  for (const user of fixture.users) {
    const client = api(status);
    const signed = await client.auth.signInWithPassword({
      email: user.email,
      password: fixture.password,
    });
    if (signed.error) throw Error("Restored password sign-in failed");
    clients.push(client);
  }
  return clients;
}
export async function cleanup(status, fixture) {
  if (!fixture) return;
  const container =
    status.API_URL === "http://127.0.0.1:56321"
      ? sourceContainer
      : status.API_URL === "http://127.0.0.1:57321"
        ? assertTargetContainer()
        : null;
  if (!container) throw Error("Unapproved fixture cleanup target");
  for (const user of fixture.users) {
    if (!/^[0-9a-f-]{36}$/.test(user.id))
      throw Error("Invalid synthetic fixture identifier");
    // Works even when Auth is intentionally stopped during a failed restore.
    sql(container, `delete from auth.users where id='${user.id}'::uuid;`);
  }
}
export async function probes(status, fixture, sourceToken, sourceRefresh) {
  const clients = await loginAll(status, fixture);
  const admin = api(status, true);
  const previousEvent = await admin
    .from("request_events")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  const expected = [2, 1, 3, 0];
  for (let index = 0; index < 4; index++) {
    const result = await clients[index].from("service_requests").select("id");
    assert.equal(result.error, null);
    assert.equal(result.data.length, expected[index]);
  }
  if (sourceToken && sourceRefresh) {
    const sourceJwt = await api(status).auth.getUser(sourceToken);
    assert.ok(sourceJwt.error, "Source access token must be rejected");
    const sourceSession = await api(status).auth.refreshSession({
      refresh_token: sourceRefresh,
    });
    assert.ok(sourceSession.error, "Source refresh session must be rejected");
  }
  const forged = await clients[0].rpc("process_service_request", {
    p_request_id: fixture.requestIds[0],
    p_expected_version: 1,
    p_assigned_to: fixture.users[2].id,
    p_status: "in_progress",
    p_resolution: "",
  });
  assert.equal(forged.error?.code, "42501");
  const started = await clients[2].rpc("process_service_request", {
    p_request_id: fixture.requestIds[0],
    p_expected_version: 1,
    p_assigned_to: fixture.users[2].id,
    p_status: "in_progress",
    p_resolution: "",
  });
  assert.equal(started.error, null);
  const stale = await clients[2].rpc("process_service_request", {
    p_request_id: fixture.requestIds[0],
    p_expected_version: 1,
    p_assigned_to: fixture.users[2].id,
    p_status: "closed",
    p_resolution: "A stale result must not replace restored work",
  });
  assert.equal(stale.error?.code, "PT409");
  const original = await admin
    .from("service_requests")
    .select("operation_key, site, system, description, priority")
    .eq("id", fixture.requestIds[0])
    .single();
  assert.equal(original.error, null);
  const replay = await clients[0]
    .rpc("create_service_request", {
      p_operation_key: original.data.operation_key,
      p_site: original.data.site,
      p_system: original.data.system,
      p_description: original.data.description,
      p_priority: original.data.priority,
    })
    .single();
  assert.equal(replay.error, null);
  assert.equal(replay.data.id, fixture.requestIds[0]);
  const nextEvent = await admin
    .from("request_events")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  assert.ok(nextEvent.data.id > previousEvent.data.id);
  const recovery = api(status);
  const sent = await recovery.auth.resetPasswordForEmail(
    fixture.users[0].email,
    { redirectTo: "http://127.0.0.1:3010/auth/callback" },
  );
  assert.equal(sent.error, null);
  const search =
    "http://127.0.0.1:57324/api/v1/search?limit=1&query=" +
    encodeURIComponent("to:" + fixture.users[0].email);
  let messages;
  for (let attempt = 0; attempt < 30; attempt++) {
    messages = await (await fetch(search)).json();
    if (messages.messages?.length) break;
    await new Promise((accept) => setTimeout(accept, 500));
  }
  assert.ok(
    messages.messages?.length,
    "Restored local recovery email required",
  );
  const mail = await (
    await fetch(
      "http://127.0.0.1:57324/api/v1/message/" +
        encodeURIComponent(messages.messages[0].ID),
    )
  ).json();
  const links = [
    ...(mail.HTML ?? mail.Text ?? "").matchAll(/https?:\/\/[^\s<>"']+/g),
  ].map((match) => match[0].replaceAll("&amp;", "&"));
  const callback = links
    .map((value) => new URL(value))
    .find(
      (value) =>
        value.origin === "http://127.0.0.1:3010" &&
        value.pathname === "/auth/callback" &&
        value.searchParams.get("type") === "recovery",
    );
  assert.ok(
    callback?.searchParams.get("token_hash"),
    "Archived recovery template required",
  );
  const verified = await recovery.auth.verifyOtp({
    type: "recovery",
    token_hash: callback.searchParams.get("token_hash"),
  });
  assert.equal(verified.error, null);
  const newPassword = randomUUID();
  const changed = await recovery.auth.updateUser({ password: newPassword });
  assert.equal(changed.error, null);
  const signedOut = await recovery.auth.signOut({ scope: "global" });
  assert.equal(signedOut.error, null);
  assert.ok(
    (
      await api(status).auth.signInWithPassword({
        email: fixture.users[0].email,
        password: fixture.password,
      })
    ).error,
  );
  const newLogin = api(status);
  assert.equal(
    (
      await newLogin.auth.signInWithPassword({
        email: fixture.users[0].email,
        password: newPassword,
      })
    ).error,
    null,
  );
  await newLogin.auth.signOut({ scope: "global" });
  const signup = await admin.auth.admin.createUser({
    email: `restore-new-${randomUUID()}@example.test`,
    password: fixture.password,
    email_confirm: true,
  });
  if (signup.error) throw Error("Restored signup trigger failed");
  try {
    const profile = await admin
      .from("profiles")
      .select("id")
      .eq("id", signup.data.user.id)
      .single();
    assert.equal(profile.error, null);
  } finally {
    await admin.auth.admin.deleteUser(signup.data.user.id);
  }
  return {
    passwordLogin: true,
    clientIsolation: true,
    activeStaff: true,
    inactiveStaff: true,
    sourceAccessRejected: sourceToken ? true : null,
    sourceRefreshRejected: sourceRefresh ? true : null,
    processingCas: true,
    signupTrigger: true,
    idempotentCreate: true,
    eventSequence: true,
    localRecoveryEmailAndAuth: true,
  };
}
function backupDirectory(runId) {
  if (!/^[0-9a-f-]{36}$/.test(runId))
    throw Error("Expected a recorded local run ID");
  const directory = join(backupBase, runId);
  assertBackupPath(backupBase, directory);
  return directory;
}
async function main(action, argument) {
  if (action === "stop") {
    try {
      stopTarget();
    } finally {
      await runLocal("stop");
    }
    return;
  }
  if (action === "verify-backup") {
    const directory = backupDirectory(argument ?? "");
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json")));
    const bundle = readBundle(directory, manifest);
    assert.equal(sha256(Buffer.from(bundle.dump, "base64")), manifest.dumpHash);
    for (const [name, value] of Object.entries(bundle.files))
      assert.equal(
        sha256(Buffer.from(value, "base64")),
        bundle.fileHashes[name],
      );
    console.log(
      "PASS: authenticated encrypted backup, dump and project file checksums",
    );
    return;
  }
  if (action !== "drill" || argument)
    throw Error("Use drill, stop or verify-backup <recorded-run-id>");
  const runId = randomUUID();
  const directory = backupDirectory(runId);
  mkdirSync(directory, { recursive: true });
  const timings = {};
  let stage = "start";
  let source, target, fixture, encrypted, manifest;
  let restored = false;
  let fixtureCleaned = false;
  const report = {
    format: 1,
    runId,
    createdAt: new Date().toISOString(),
    result: "FAIL",
    sourceProject: projectId,
    targetProject: restoreId,
    scope: "synthetic-local-only",
    productionChanged: false,
    timings,
  };
  const began = performance.now();
  try {
    console.log(
      "SR08: starting only the dedicated test source and restore target.",
    );
    await runLocal("start");
    source = JSON.parse(
      cli(join(root, ".local-tests"), ["status", "--output", "json"]),
    );
    assertTestStatus(source);
    target = startTarget();
    const destination = assertTargetContainer();
    assertEmptyRestoreEnvironment((query) => sql(sourceContainer, query));
    assertEmptyRestoreEnvironment((query) => sql(destination, query));
    const sourceImage = command("docker", [
      "inspect",
      sourceContainer,
      "--format",
      "{{.Image}}",
    ]);
    assert.equal(
      command("docker", ["inspect", destination, "--format", "{{.Image}}"]),
      sourceImage,
    );
    report.image = sourceImage;
    const sourceKeys = await (
      await fetch(source.API_URL + "/auth/v1/.well-known/jwks.json")
    ).json();
    const targetKeys = await (
      await fetch(target.API_URL + "/auth/v1/.well-known/jwks.json")
    ).json();
    assert.notEqual(fingerprint(sourceKeys), fingerprint(targetKeys));
    report.distinctUserSigningKeys = true;
    report.cliApiKeysAreSharedDefaults =
      source.SECRET_KEY === target.SECRET_KEY;
    timings.startupSeconds = (performance.now() - began) / 1000;
    stage = "seed";
    fixture = { password: randomUUID(), users: [], requestIds: [] };
    const seeded = await seed(source, fixture);
    const session = (await seeded.clients[0].auth.getSession()).data.session;
    const before = inventory(sourceContainer);
    stage = "backup";
    console.log(
      "SR08: backing up schema, ACLs, Auth and synthetic data to an encrypted bundle.",
    );
    const backupStart = performance.now();
    const dump = command(
      "docker",
      [
        "exec",
        sourceContainer,
        "pg_dump",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "--format=custom",
      ],
      { buffer: true },
    );
    const files = filesForBackup();
    const payload = {
      dump: dump.toString("base64"),
      fixture,
      inventory: before,
      files,
      fileHashes: Object.fromEntries(
        Object.entries(files).map(([name, value]) => [
          name,
          sha256(Buffer.from(value, "base64")),
        ]),
      ),
    };
    encrypted = saveBundle(directory, payload, `${projectId}/${runId}`);
    manifest = {
      format: 1,
      runId,
      context: `${projectId}/${runId}`,
      encryptedHash: encrypted.hash,
      dumpHash: sha256(dump),
      keyMode: encrypted.mode,
      image: sourceImage,
    };
    writeFileSync(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    timings.backupSeconds = (performance.now() - backupStart) / 1000;
    report.dumpBytes = dump.length;
    report.backupHash = encrypted.hash;
    const marker = await seeded.clients[1]
      .rpc("create_service_request", {
        p_operation_key: randomUUID(),
        p_site: "AFTER BACKUP — expected loss",
        p_system: "CCTV",
        p_description: "Synthetic write deliberately outside the snapshot",
        p_priority: "low",
      })
      .single();
    if (marker.error) throw Error("RPO marker creation failed");
    stage = "restore";
    console.log(
      "SR08: recreating only the owned empty restore database, then restoring the archive.",
    );
    const restoreStart = performance.now();
    const bundle = readBundle(directory, manifest, encrypted.key);
    assert.equal(sha256(Buffer.from(bundle.dump, "base64")), manifest.dumpHash);
    report.projectFilesVerified = recoverFiles(bundle, runId);
    assertTargetContainer();
    targetStatus();
    command("docker", [
      "stop",
      `supabase_auth_${restoreId}`,
      `supabase_rest_${restoreId}`,
    ]);
    replaceEmptyRestoreEnvironment(
      (query) => sql(destination, query),
      () =>
        sql(
          destination,
          "DROP DATABASE postgres WITH (FORCE);\nCREATE DATABASE postgres OWNER postgres TEMPLATE template0;\n",
          "template1",
        ),
    );
    command(
      "docker",
      [
        "exec",
        "-i",
        destination,
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
    restored = true;
    const after = inventory(destination);
    for (const name of Object.keys(before)) {
      if (fingerprint(before[name]) !== fingerprint(after[name]))
        throw Error(`Restored inventory mismatch: ${name}`);
    }
    report.inventoryEqual = Object.fromEntries(
      Object.keys(before).map((name) => [name, true]),
    );
    assert.equal(
      sql(
        destination,
        `select count(*) from public.service_requests where id='${marker.data.id}';`,
      ),
      "0",
    );
    report.expectedPostSnapshotRequestsLost = 1;
    report.snapshotRequests = before.data["public.service_requests"].length;
    report.snapshotEvents = before.data["public.request_events"].length;
    // Recovery deliberately requires fresh sessions under the target signing key.
    sql(destination, "TRUNCATE auth.refresh_tokens, auth.sessions CASCADE;");
    command("docker", [
      "start",
      `supabase_auth_${restoreId}`,
      `supabase_rest_${restoreId}`,
    ]);
    sql(destination, "NOTIFY pgrst, 'reload schema';");
    stage = "acceptance";
    console.log(
      "SR08: verifying restored password login, client isolation and write contracts.",
    );
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const health = await fetch(target.API_URL + "/auth/v1/health");
        if (health.ok) break;
      } catch {
        /* owned services starting */
      }
      await new Promise((accept) => setTimeout(accept, 500));
    }
    report.probes = await probes(
      target,
      fixture,
      session.access_token,
      session.refresh_token,
    );
    assert.equal(
      (
        await api(source).auth.signInWithPassword({
          email: fixture.users[0].email,
          password: fixture.password,
        })
      ).error,
      null,
    );
    report.sourcePasswordUnchanged = true;
    await cleanup(source, fixture);
    await cleanup(target, fixture);
    fixtureCleaned = true;
    const testsDirectory = join(restoreDir, "supabase/tests");
    mkdirSync(testsDirectory, { recursive: true });
    for (const [name, encoded] of Object.entries(bundle.files)) {
      if (/^supabase\/tests\/[^/]+\.sql$/.test(name))
        writeFileSync(join(restoreDir, name), Buffer.from(encoded, "base64"));
    }
    const sqlResult = cli(restoreDir, ["test", "db", "--local"]);
    const count = /Tests=(\d+)/.exec(sqlResult);
    if (!count || Number(count[1]) !== 200)
      throw Error("Expected restored SQL regression did not pass");
    report.sqlRegressionTests = Number(count[1]);
    timings.restoreAndAcceptanceSeconds =
      (performance.now() - restoreStart) / 1000;
    report.result = "PASS";
  } catch (error) {
    report.failedStage = stage;
    report.failure = error.message;
    if (encrypted && manifest)
      writeFileSync(
        join(directory, "diagnostics.aes-gcm"),
        sealBackup(
          Buffer.from(error.diagnostics ?? error.message),
          encrypted.key,
          manifest.context,
        ),
      );
    throw error;
  } finally {
    stage = "cleanup";
    try {
      if (!fixtureCleaned && source) await cleanup(source, fixture);
      if (!fixtureCleaned && target && restored) await cleanup(target, fixture);
      report.cleaned = true;
    } catch {
      report.cleaned = false;
      report.result = "FAIL";
    }
    try {
      stopTarget();
      await runLocal("stop");
      report.stopped = true;
    } catch {
      report.stopped = false;
      report.result = "FAIL";
    }
    timings.totalSeconds = (performance.now() - began) / 1000;
    writeFileSync(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `SR08: ${report.result}; report .local-backups/${runId}/report.json`,
    );
  }
  if (report.result !== "PASS")
    throw Error("Restore drill cleanup or shutdown failed");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv[2] ?? "drill", process.argv[3]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
