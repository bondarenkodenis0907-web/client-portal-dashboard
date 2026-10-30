import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { runLocal, cleanEnvironment, projectId } from "./local-tests.mjs";

const root = process.cwd();
const rollbackSha = "47865d5eb269833330793c5d36e725553e0f981d";
const status = await runLocal("verify");
const pack = resolve(root, "..", "audit", "rollback-builds", randomUUID());
let stage = "archive";
const source = join(pack, "rollback-source");
mkdirSync(source, { recursive: true });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    "Local rollback preparation failed at " +
      stage +
      " (" +
      (result.error?.code ?? result.status) +
      ") / " +
      (
        (result.stdout?.toString() + result.stderr?.toString()).match(
          /(?:Type error:|Error:)[^\n]*/,
        )?.[0] ?? "no diagnostic"
      ).slice(0, 180),
  );
  return result.stdout;
}
const archive = command("git", ["archive", "--format=tar", rollbackSha]);
writeFileSync(join(pack, "rollback-source.tar"), archive, { flag: "wx" });
command("tar", ["-xf", "-", "-C", source], { input: archive });
assert.equal(
  sha256(readFileSync(join(root, "package-lock.json"))),
  sha256(readFileSync(join(source, "package-lock.json"))),
  "Rollback dependency lock differs",
);
symlinkSync(
  join(root, "node_modules"),
  join(source, "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
const channel =
  process.platform === "win32" &&
  existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
    ? "msedge"
    : undefined;
const env = {
  ...cleanEnvironment(process.env),
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  TEST_SUPABASE_SECRET_KEY: status.SECRET_KEY,
  CLIENT_PORTAL_LOCAL_TESTS: "1",
  RECOVERY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  NEXT_TELEMETRY_DISABLED: "1",
  TZ: "UTC",
  ...(channel ? { PLAYWRIGHT_CHANNEL: channel } : {}),
};
const next = join(root, "node_modules/next/dist/bin/next");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const staffClient = createClient(
  status.API_URL,
  status.PUBLISHABLE_KEY,
  options,
);
const ids = [];
const suffix = randomUUID(),
  password = randomBytes(24).toString("hex"),
  email = `release-switch-${suffix}@example.test`;
const operation = randomUUID();
let server, browser, report, failure;
const cleanup = {
  browserClosed: false,
  serverStopped: false,
  usersRemoved: true,
};
async function stop() {
  if (!server) return;
  const child = server;
  server = undefined;
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.kill();
  await Promise.race([
    closed,
    delay(10000).then(() => {
      throw Error("Local rollback server did not stop");
    }),
  ]);
}
async function start(cwd) {
  assert(!server);
  server = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", "3010"],
    { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.resume();
  server.stderr.resume();
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Local rollback server exited");
    try {
      const r = await fetch("http://127.0.0.1:3010/", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        await r.body.cancel();
        return;
      }
    } catch {}
    await delay(100);
  }
  throw Error("Local rollback server not ready");
}
async function seeRequest(id, text) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3010/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`http://127.0.0.1:3010/dashboard/requests/${id}`);
    await page.getByText(text, { exact: true }).first().waitFor();
  } finally {
    await context.close();
  }
}
try {
  console.log(
    "Building pinned rollback source against the eleven-migration local backend.",
  );
  stage = "rollback-build";
  command(process.execPath, [next, "build", "--webpack"], { cwd: source, env });
  await start(source);
  const config = join(pack, "rollback-tests.config.mjs");
  writeFileSync(
    config,
    `export default ${JSON.stringify({ testDir: join(source, "tests/browser"), workers: 1, retries: 0, timeout: 60000, outputDir: join(pack, "test-results"), use: { baseURL: "http://127.0.0.1:3010", viewport: { width: 1440, height: 1000 }, launchOptions: { channel }, trace: "off" } }, null, 2)};\n`,
  );
  command(
    process.execPath,
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      config,
      "--reporter=json",
    ],
    {
      env: {
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(pack, "browser-report.json"),
      },
    },
  );
  const browserStats = JSON.parse(
    readFileSync(join(pack, "browser-report.json"), "utf8"),
  ).stats;
  assert.equal(
    browserStats.expected,
    32,
    "Rollback must pass all QA scenarios",
  );
  assert.equal(browserStats.unexpected, 0);
  assert.equal(browserStats.skipped, 0);
  assert.equal(browserStats.flaky, 0);
  console.log(
    "PASS: 32 browser scenarios including QA fixes against pinned rollback build on schema 11.",
  );
  for (const address of [email, `release-staff-${suffix}@example.test`]) {
    const r = await admin.auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
    });
    assert.equal(r.error, null);
    ids.push(r.data.user.id);
  }
  assert.equal(
    (
      await admin
        .from("service_staff")
        .insert({ user_id: ids[1], display_name: "Release test engineer" })
    ).error,
    null,
  );
  assert.equal(
    (await client.auth.signInWithPassword({ email, password })).error,
    null,
  );
  assert.equal(
    (
      await staffClient.auth.signInWithPassword({
        email: `release-staff-${suffix}@example.test`,
        password,
      })
    ).error,
    null,
  );
  const args = {
    p_operation_key: operation,
    p_site: "Release test office",
    p_system: "CCTV",
    p_description: "Switch continuity probe",
    p_priority: "medium",
  };
  const made = await client.rpc("create_service_request", args);
  assert.equal(made.error, null);
  const id = made.data[0].id;
  browser = await chromium.launch({ channel });
  await seeRequest(id, args.p_description);
  await stop();
  console.log(
    "Building current candidate and checking retained request through switch and rollback.",
  );
  stage = "candidate-build";
  command(process.execPath, [next, "build", "--webpack"], { env });
  await start(root);
  await seeRequest(id, args.p_description);
  const progress = await staffClient.rpc("process_service_request", {
    p_request_id: id,
    p_expected_version: 1,
    p_assigned_to: ids[1],
    p_status: "in_progress",
    p_resolution: null,
  });
  assert.equal(progress.error, null);
  const closed = await staffClient.rpc("process_service_request", {
    p_request_id: id,
    p_expected_version: 2,
    p_assigned_to: ids[1],
    p_status: "closed",
    p_resolution: "Release continuity verified",
  });
  assert.equal(closed.error, null);
  await stop();
  await start(source);
  await seeRequest(id, "Release continuity verified");
  const replay = await client.rpc("create_service_request", args);
  assert.equal(replay.error, null);
  assert.equal(replay.data[0].id, id);
  assert.equal(replay.data[0].version, 3);
  assert.equal(replay.data[0].status, "closed");
  const events = await client
    .from("request_events")
    .select("id")
    .eq("request_id", id);
  assert.equal(events.error, null);
  assert.equal(events.data.length, 3);
  // Direct API writes must remain blocked independently of the frontend flag.
  const sql = (q) =>
    command(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${projectId}`,
        "psql",
        "-XqAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: q },
    );
  sql("update private.maintenance_state set enabled=true where singleton;");
  try {
    const blocked = await client.rpc("create_service_request", {
      ...args,
      p_operation_key: randomUUID(),
    });
    assert.equal(blocked.status, 503);
  } finally {
    sql("update private.maintenance_state set enabled=false where singleton;");
  }
  report = {
    date: new Date().toISOString(),
    scope: "local synthetic, no hosted deployment",
    rollbackSource: rollbackSha,
    archiveSha256: sha256(archive),
    sourceArchive: relative(root, join(pack, "rollback-source.tar")).replaceAll(
      "\\",
      "/",
    ),
    buildDirectory: relative(root, source).replaceAll("\\", "/"),
    packageLockSha256: sha256(readFileSync("package-lock.json")),
    schemaMigrations: 11,
    browserScenarios: browserStats.expected,
    sequence: [
      "rollback baseline",
      "current uncommitted candidate",
      "rollback baseline",
    ],
    retainedRequest: true,
    retainedVersion: 3,
    retainedEvents: 3,
    idempotentReplay: true,
    databaseGateBlocksRollback: true,
    rollbackFrontendMaintenance:
      "INCLUDED; HTTP flag not exercised by this drill",
    productionChanged: false,
    hostedArtifact: "NOT_BUILT",
    result: "PENDING_CLEANUP",
  };
} catch (error) {
  failure = error;
} finally {
  try {
    await browser?.close();
    cleanup.browserClosed = true;
  } catch {
    failure ??= Error("Browser cleanup failed");
  }
  try {
    await stop();
    cleanup.serverStopped = true;
  } catch {
    failure ??= Error("Server cleanup failed");
  }
  // Delete request owner first so assigned engineers are no longer referenced.
  for (const id of ids) {
    try {
      assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    } catch {
      cleanup.usersRemoved = false;
      failure ??= Error("Synthetic fixture cleanup failed");
    }
  }
  report ??= {
    date: new Date().toISOString(),
    scope: "local synthetic",
    rollbackSource: rollbackSha,
    productionChanged: false,
    failedStage: stage,
  };
  report.cleanup = cleanup;
  report.result = failure ? "FAIL" : "PASS";
  writeFileSync(
    "docs/evidence/rollback-build-20261030.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (failure) throw failure;
console.log(
  "PASS: pinned rollback build, 32 browser tests, retained request/version/history, DB maintenance denial and successful cleanup.",
);
