import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  lstatSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEnvironment, projectId } from "./local-tests.mjs";
import {
  restoreIdentity,
  assertRestoreOwner,
  assertLocalRestoreStatus,
} from "./backup-safety.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const restoreDir = join(root, ".local-restore");
export const restoreId = restoreIdentity(root);
const excluded =
  "studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor";
export function command(program, args, { input, buffer = false } = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: cleanEnvironment(process.env),
    windowsHide: true,
    input,
    encoding: buffer ? undefined : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    // Never echo status/start output, connection strings, fixture SQL or dumps.
    const error = Error(
      `Local ${program === process.execPath ? "CLI" : program} operation failed (${result.status ?? result.error?.code})`,
    );
    error.diagnostics = result.stderr?.toString() ?? "";
    throw error;
  }
  return buffer ? result.stdout : result.stdout.trim();
}
export function cli(workdir, args) {
  return command(process.execPath, [
    "node_modules/supabase/dist/supabase.js",
    ...args,
    "--workdir",
    workdir,
  ]);
}
export function ownerCheck() {
  if (
    !existsSync(join(restoreDir, "owner.json")) ||
    lstatSync(restoreDir).isSymbolicLink()
  )
    throw Error("Restore directory is not owned");
  assertRestoreOwner(
    JSON.parse(readFileSync(join(restoreDir, "owner.json"))),
    root,
    readFileSync(join(restoreDir, "supabase/config.toml"), "utf8"),
    existsSync(join(restoreDir, "supabase/.temp/project-ref")),
  );
}
export function prepareTarget() {
  if (existsSync(restoreDir)) ownerCheck();
  else {
    const existing = command("docker", [
      "ps",
      "-a",
      "--filter",
      `label=com.supabase.cli.project=${restoreId}`,
      "--format",
      "{{.ID}}",
    ]);
    if (existing) throw Error("An unowned restore project already exists");
    mkdirSync(join(restoreDir, "supabase/templates"), { recursive: true });
    writeFileSync(
      join(restoreDir, "owner.json"),
      JSON.stringify({ root, projectId: restoreId }),
    );
  }
  // Deliberately do not copy application migrations: they must come from backup.
  const keyPath = join(restoreDir, "signing_keys.json");
  const config = readFileSync(join(root, "supabase/test.config.toml"), "utf8")
    .replace(
      'project_id = "client-portal-tests"',
      `project_id = "${restoreId}"`,
    )
    .replaceAll("563", "573");
  if (!existsSync(join(restoreDir, "supabase/config.toml")))
    writeFileSync(join(restoreDir, "supabase/config.toml"), config);
  if (!existsSync(keyPath)) {
    const generated = JSON.parse(cli(restoreDir, ["gen", "signing-key"]));
    writeFileSync(
      keyPath,
      JSON.stringify(Array.isArray(generated) ? generated : [generated]),
      { mode: 0o600 },
    );
  }
  writeFileSync(
    join(restoreDir, "supabase/config.toml"),
    config
      .replace(
        "[auth]\n",
        `[auth]\nsigning_keys_path = ${JSON.stringify(keyPath.replaceAll("\\", "/"))}\n`,
      )
      .replace(
        "[auth]\r\n",
        `[auth]\r\nsigning_keys_path = ${JSON.stringify(keyPath.replaceAll("\\", "/"))}\r\n`,
      ),
  );
  copyFileSync(
    join(root, "supabase/templates/recovery.html"),
    join(restoreDir, "supabase/templates/recovery.html"),
  );
  ownerCheck();
}
export function targetStatus() {
  ownerCheck();
  const status = JSON.parse(cli(restoreDir, ["status", "--output", "json"]));
  assertLocalRestoreStatus(status);
  return status;
}
export function assertTargetContainer() {
  ownerCheck();
  const container = `supabase_db_${restoreId}`;
  const label = command("docker", [
    "inspect",
    container,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
  ]);
  if (label !== restoreId) throw Error("Restore container owner mismatch");
  return container;
}
export function startTarget() {
  prepareTarget();
  cli(restoreDir, ["start", "--exclude", excluded]);
  assertTargetContainer();
  return targetStatus();
}
export function stopTarget() {
  if (!existsSync(restoreDir)) return;
  ownerCheck();
  cli(restoreDir, ["stop", "--project-id", restoreId]);
}

export function queryLocalDatabase(container, query, database = "postgres") {
  if (
    ![`supabase_db_${projectId}`, `supabase_db_${restoreId}`].includes(
      container,
    )
  )
    throw Error("Unapproved local container");
  return command(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query },
  );
}
