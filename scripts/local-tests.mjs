import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workdir = join(root, ".local-tests");
const ownerFile = join(workdir, "owner.json");
export const cliVersion = "2.122.0";
export const apiOrigin = "http://127.0.0.1:56321";
export const projectId =
  "client-portal-tests-" +
  createHash("sha256").update(root).digest("hex").slice(0, 8);
const cliEntry = join(root, "node_modules/supabase/dist/supabase.js");
const excluded =
  "studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor";

export function cleanEnvironment(input) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        !/SUPABASE|^VERCEL|^NETLIFY|^CONTEXT$|^CLIENT_PORTAL_LOCAL_TESTS$|^CLIENT_PORTAL_MAINTENANCE$|^RECOVERY_SIGNING_SECRET$/.test(
          key.toUpperCase(),
        ),
    ),
  );
}

export function assertTestStatus(status) {
  if (status.API_URL !== apiOrigin) {
    throw new Error("Refusing tests: expected the dedicated loopback API.");
  }
  if (!status.PUBLISHABLE_KEY || !status.SECRET_KEY) {
    throw new Error("Local test credentials are unavailable.");
  }
}

function execute(command, args, { visible = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...cleanEnvironment(process.env), ...env },
    encoding: "utf8",
    stdio: visible ? "inherit" : "pipe",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    // CLI status/start output can contain credentials; do not echo it.
    throw new Error(
      `${command === process.execPath ? "Node command" : command} failed (${result.status ?? result.error?.code}).`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function cli(args, options) {
  return execute(
    process.execPath,
    [cliEntry, ...args, "--workdir", workdir],
    options,
  );
}

function assertRuntime() {
  const expectedNode = readFileSync(join(root, ".node-version"), "utf8").trim();
  if (process.versions.node !== expectedNode) {
    throw new Error(`Use Node ${expectedNode} for the local test profile.`);
  }
  const installed = JSON.parse(
    readFileSync(join(root, "node_modules/supabase/package.json"), "utf8"),
  );
  if (installed.version !== cliVersion) {
    throw new Error("Run npm ci to install the pinned Supabase CLI.");
  }
}

function assertOwner() {
  if (!existsSync(ownerFile))
    throw new Error("Refusing an unowned test workdir.");
  const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
  if (owner.root !== root || owner.projectId !== projectId) {
    throw new Error("Test workdir belongs to a different checkout.");
  }
  const config = readFileSync(join(workdir, "supabase/config.toml"), "utf8");
  if (!config.includes(`project_id = "${projectId}"`)) {
    throw new Error("Unexpected project ID in the test workdir.");
  }
  if (existsSync(join(workdir, "supabase/.temp/project-ref"))) {
    throw new Error(
      "The test workdir must never be linked to a hosted project.",
    );
  }
}

function snapshotHash() {
  const hash = createHash("sha256");
  hash.update(cliVersion);
  hash.update(readFileSync(join(root, "supabase/test.config.toml")));
  for (const name of readdirSync(join(root, "supabase/templates")).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(root, "supabase/templates", name)));
  }
  for (const name of readdirSync(join(root, "supabase/migrations")).sort()) {
    if (name.endsWith(".sql")) {
      hash.update(name);
      hash.update(readFileSync(join(root, "supabase/migrations", name)));
    }
  }
  return hash.digest("hex");
}

function prepare(allowChangedSnapshot = false) {
  if (existsSync(workdir)) {
    assertOwner();
    const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
    if (
      owner.snapshotHash &&
      owner.snapshotHash !== snapshotHash() &&
      !allowChangedSnapshot
    ) {
      throw new Error(
        "Test migrations/config changed. Reset only the test profile before testing.",
      );
    }
  } else {
    const existing = execute("docker", [
      "ps",
      "-a",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
      "--format",
      "{{.ID}}",
    ]);
    if (existing)
      throw new Error("An unowned Docker test project already exists.");
    mkdirSync(join(workdir, "supabase"), { recursive: true });
    writeFileSync(ownerFile, JSON.stringify({ root, projectId }, null, 2));
  }
  const config = readFileSync(join(root, "supabase/test.config.toml"), "utf8");
  writeFileSync(
    join(workdir, "supabase/config.toml"),
    config.replace(
      'project_id = "client-portal-tests"',
      `project_id = "${projectId}"`,
    ),
  );
  for (const folder of ["migrations", "tests", "templates"]) {
    const source = join(root, "supabase", folder);
    const target = join(workdir, "supabase", folder);
    mkdirSync(target, { recursive: true });
    const names = readdirSync(source).filter((name) =>
      name.endsWith(folder === "templates" ? ".html" : ".sql"),
    );
    if (readdirSync(target).some((name) => !names.includes(name))) {
      throw new Error(
        "Unexpected files in test snapshot; review before proceeding.",
      );
    }
    for (const name of names)
      copyFileSync(join(source, name), join(target, name));
  }
  assertOwner();
}

function verify(recordSnapshot = false) {
  assertOwner();
  const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
  if (
    owner.snapshotHash &&
    owner.snapshotHash !== snapshotHash() &&
    !recordSnapshot
  ) {
    throw new Error("Test snapshot is stale; reset only the test profile.");
  }
  const versions = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0])
    .sort();
  const query = `select json_build_object(
    'versions', (select json_agg(version order by version) from supabase_migrations.schema_migrations),
    'tables', (select count(*) from pg_tables where schemaname='public' and tablename in ('profiles','service_requests','service_staff','request_events') and rowsecurity),
    'active_column', exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_staff' and column_name='is_active'),
    'input_checks', (select count(*) from pg_constraint where conrelid='public.service_requests'::regclass and conname like '%_input_check'),
    'submission_unique', exists(select 1 from pg_constraint where conrelid='public.service_requests'::regclass and conname='service_requests_user_operation_key' and contype='u'),
    'submission_rpc', exists(select 1 from pg_proc where oid=to_regprocedure('public.create_service_request(uuid,text,text,text,text)') and not prosecdef and proconfig @> array['search_path=""']),
    'processing_rpc', exists(select 1 from pg_proc where oid=to_regprocedure('public.process_service_request(uuid,integer,uuid,text,text)') and not prosecdef and proconfig @> array['search_path=""']),
    'version_guard', exists(select 1 from pg_trigger where tgrelid='public.service_requests'::regclass and tgname='check_request_version' and tgenabled='O'),
    'version_input', exists(select 1 from pg_constraint where conrelid='public.service_requests'::regclass and conname='service_requests_expected_version_transient'),
    'maintenance_triggers', (select count(*) from pg_trigger where tgname='maintenance_write_gate' and tgenabled='O' and tgrelid in ('public.profiles'::regclass,'public.service_requests'::regclass,'public.request_events'::regclass,'public.service_staff'::regclass,'auth.users'::regclass)),
    'maintenance_off', (select not enabled from private.maintenance_state where singleton)
  );`;
  const schema = JSON.parse(
    execute("docker", [
      "exec",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      query,
    ]),
  );
  if (
    JSON.stringify(schema.versions) !== JSON.stringify(versions) ||
    schema.tables !== 4 ||
    !schema.active_column ||
    schema.input_checks !== 4 ||
    !schema.submission_unique ||
    !schema.submission_rpc ||
    !schema.processing_rpc ||
    !schema.version_guard ||
    !schema.version_input ||
    schema.maintenance_triggers !== 5 ||
    !schema.maintenance_off
  )
    throw new Error(
      "Test schema differs from migrations; reset only the test profile.",
    );
  const status = JSON.parse(cli(["status", "--output", "json"]));
  assertTestStatus(status);
  writeFileSync(
    ownerFile,
    JSON.stringify({ root, projectId, snapshotHash: snapshotHash() }, null, 2),
  );
  console.log(
    `PASS: ${versions.length} migrations, 4 RLS tables, local API ${apiOrigin}`,
  );
  return status;
}

async function start(check = true, allowChangedSnapshot = false) {
  prepare(allowChangedSnapshot);
  console.log(`Starting dedicated test backend: ${projectId}`);
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [cliEntry, "start", "--exclude", excluded, "--workdir", workdir],
      {
        cwd: root,
        env: cleanEnvironment(process.env),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let pending = "";
    child.stdout.resume(); // Startup stdout may include local credentials.
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/[\r\n]/);
      pending = lines.pop();
      for (const line of lines) {
        const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
        if (
          /pull|download|extract|initializ|migrat|health|error|failed|docker|start|ready/i.test(
            plain,
          ) &&
          !/secret|key|token|password|credential|postgresql:\/\//i.test(plain)
        ) {
          console.log(plain);
        }
      }
    });
    child.on("error", () =>
      reject(new Error("Could not start the pinned CLI.")),
    );
    child.on("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`Test backend startup failed (${code}).`)),
    );
  });
  return check ? verify() : null;
}

function browser(status) {
  assertTestStatus(status);
  const env = {
    TZ: "UTC",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    TEST_SUPABASE_SECRET_KEY: status.SECRET_KEY,
    CLIENT_PORTAL_LOCAL_TESTS: "1",
    RECOVERY_SIGNING_SECRET: randomBytes(32).toString("hex"),
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (
    !process.env.PLAYWRIGHT_CHANNEL &&
    process.platform === "win32" &&
    existsSync(edge)
  ) {
    env.PLAYWRIGHT_CHANNEL = "msedge";
  }
  console.log("Building against the verified test backend (webpack).");
  execute(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    {
      visible: true,
      env,
    },
  );
  execute(
    process.execPath,
    [join(root, "node_modules/@playwright/test/cli.js"), "test"],
    {
      visible: true,
      env,
    },
  );
  execute(
    process.execPath,
    ["--test", join(root, "tests/server-auth.integration.mjs")],
    { visible: true, env },
  );
}

export async function runLocal(action = "all") {
  if (
    !["all", "start", "verify", "sql", "browser", "reset", "stop"].includes(
      action,
    )
  ) {
    throw new Error("Use all, start, verify, sql, browser, reset or stop.");
  }
  assertRuntime();
  if (action === "stop") {
    if (!existsSync(workdir)) return;
    assertOwner();
    cli(["stop", "--project-id", projectId]);
    console.log(`Stopped only ${projectId}; test volumes retained.`);
    return;
  }
  if (action === "verify") return verify();
  if (action === "reset") {
    await start(false, true);
    assertOwner();
    cli(["db", "reset", "--local", "--no-seed", "--yes"]);
    return verify(true);
  }
  const status = await start();
  if (action === "all" || action === "sql") {
    cli(["test", "db", "--local"], { visible: true });
  }
  if (action === "all" || action === "browser") browser(status);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runLocal(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
