import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { runLocal, projectId } from "./local-tests.mjs";
import { assertEmptyRestoreEnvironment } from "./restore-preflight.mjs";

await runLocal("start");
const container = `supabase_db_${projectId}`;
const database = "release_rehearsal_" + randomUUID().replaceAll("-", "");
let created = false;
function command(args, input) {
  const r = spawnSync("docker", args, {
    input,
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    r.status,
    0,
    "Synthetic release rehearsal command failed: " +
      (r.stderr?.toString().match(/ERROR:[^\n]*/)?.[0] ?? "no SQL error"),
  );
  return r.stdout;
}
const sql = (query, db = database) =>
  command(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-XqAt",
      "-U",
      "postgres",
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    query,
  )
    .toString()
    .trim();
const migrations = readdirSync("supabase/migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort();
assert.equal(
  migrations.length,
  11,
  "Review rehearsal for a changed migration set",
);
const gate = migrations.find((n) => n.endsWith("_maintenance_write_gate.sql"));
const order = [...migrations.slice(0, 8), gate, ...migrations.slice(8, 10)];
const applied = [];
const apply = (name) => {
  const content = readFileSync("supabase/migrations/" + name);
  sql(
    "begin;\n" +
      content +
      `\ninsert into supabase_migrations.schema_migrations(version) values ('${name.split("_")[0]}');\ncommit;`,
  );
  applied.push({
    name,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
};
const client = randomUUID(),
  staff = randomUUID(),
  operation = randomUUID();
let legacy;
const asUser = (id, q) =>
  `begin; set local role authenticated; set local request.jwt.claim.sub='${id}'; ${q}; commit;`;
const expectBlocked = (q) => {
  assert.equal(
    sql(
      `do $probe$ begin ${q}; raise exception 'Unexpected admitted write'; exception when sqlstate 'PT503' then null; end $probe$; select 'blocked';`,
    ),
    "blocked",
  );
};
try {
  sql(`create database ${database}`, "postgres");
  created = true;
  // Copy only the Auth schema, never account rows or credentials.
  const auth = command([
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema-only",
    "--no-owner",
    "--no-acl",
    "--schema=auth",
  ]);
  sql(
    'create schema extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;',
  );
  const authSchema = auth
    .toString()
    .replace(
      /^CREATE TRIGGER (?:maintenance_write_gate|on_auth_user_created)\b[\s\S]*?;\r?\n/gm,
      "",
    );
  assert.equal(
    (
      auth
        .toString()
        .match(
          /^CREATE TRIGGER (?:maintenance_write_gate|on_auth_user_created)\b/gm,
        ) ?? []
    ).length,
    2,
    "Expected exactly two application triggers in current Auth schema",
  );
  sql(authSchema);
  sql("grant usage on schema auth to authenticated, anon, service_role;");
  sql(
    "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);",
  );
  for (const name of order.slice(0, 8)) apply(name);
  sql(
    `insert into auth.users(id,email) values ('${client}','release-client@example.test'),('${staff}','release-staff@example.test'); insert into public.service_staff(user_id,display_name) values('${staff}','Release staff');`,
  );
  legacy = sql(
    asUser(
      client,
      `insert into public.service_requests(user_id,site,system,description) values('${client}','Office','CCTV','Before migration') returning id`,
    ),
  );
  assert.match(legacy, /^[a-f0-9-]{36}$/);
  apply(gate);
  assert.equal(
    sql("select enabled from private.maintenance_state where singleton"),
    "f",
  );
  // Existing frontend contract still works before the disruptive migrations.
  sql(
    asUser(
      staff,
      `update public.service_requests set status='in_progress',assigned_to='${staff}' where id='${legacy}'`,
    ),
  );
  const before = sql(
    `select json_build_object('requests',(select count(*) from public.service_requests),'events',(select count(*) from public.request_events),'status',(select status from public.service_requests where id='${legacy}'))`,
  );
  sql(
    "begin; set local lock_timeout='5s'; update private.maintenance_state set enabled=true where singleton; commit;",
  );
  expectBlocked(
    `insert into public.service_requests(user_id,site,system,description) values('${client}','Office','CCTV','Old tab')`,
  );
  for (const name of order.slice(9)) {
    apply(name);
    assert.equal(
      sql("select enabled from private.maintenance_state where singleton"),
      "t",
      "Migration must preserve closed gate",
    );
    expectBlocked(
      "update public.service_requests set status=status where false",
    );
  }
  const after = sql(
    `select json_build_object('requests',(select count(*) from public.service_requests),'events',(select count(*) from public.request_events),'status',(select status from public.service_requests where id='${legacy}'))`,
  );
  assert.equal(after, before, "Upgrade must retain legacy requests and events");
  assert.equal(
    sql(
      `select operation_key is null and version=1 and expected_version is null from public.service_requests where id='${legacy}'`,
    ),
    "t",
  );
  const history = JSON.parse(
    sql(
      "select json_agg(version order by version) from supabase_migrations.schema_migrations",
    ),
  );
  assert.deepEqual(
    history,
    migrations.map((n) => n.split("_")[0]),
  );
  sql("update private.maintenance_state set enabled=false where singleton;");
  sql(
    asUser(
      client,
      `select * from public.create_service_request('${operation}','Office','CCTV','After migration','medium')`,
    ),
  );
  sql(
    asUser(
      staff,
      `select * from public.process_service_request('${legacy}',1,'${staff}','closed','Verified after migration')`,
    ),
  );
  assert.equal(
    sql(
      `select status='closed' and version=2 from public.service_requests where id='${legacy}'`,
    ),
    "t",
  );
  // Exercise the restore guard on this owned temporary database without host ports.
  sql(
    `delete from auth.users where id='${client}'; delete from auth.users where id='${staff}';`,
  );
  assertEmptyRestoreEnvironment(sql);
  sql("update private.maintenance_state set enabled=true where singleton;");
  assert.throws(
    () => assertEmptyRestoreEnvironment(sql),
    /contains application/,
  );
  sql("delete from private.maintenance_state;");
  assert.throws(
    () => assertEmptyRestoreEnvironment(sql),
    /contains application/,
  );
  sql(
    "insert into private.maintenance_state values(true,false); alter table private.maintenance_state add column unexpected text;",
  );
  assert.throws(
    () => assertEmptyRestoreEnvironment(sql),
    /contains application/,
  );
  sql("alter table private.maintenance_state drop column unexpected;");
  assertEmptyRestoreEnvironment(sql);
  const r = {
    date: new Date().toISOString(),
    scope: "synthetic separate database on owned local test container",
    result: "PASS",
    serverVersion: sql("show server_version"),
    authSchemaOnlyNoProviderACL: true,
    order: applied,
    assertions: [
      "eight-migration legacy writes",
      "gate installed before SR06/SR07",
      "old tab rejected",
      "gate retained after each migration",
      "legacy data/events preserved",
      "eleven history versions",
      "legacy key/version backfill",
      "new RPC creation and processing after reopening",
      "restore preflight accepts only exact disabled singleton; rejects enabled, missing and extra-column states",
    ],
    productionChanged: false,
    databaseRemoved: false,
  };
  sql(`drop database ${database} with (force)`, "postgres");
  created = false;
  r.databaseRemoved = true;
  writeFileSync(
    "docs/evidence/release-order-20261030.json",
    JSON.stringify(r, null, 2) + "\n",
  );
  console.log(
    "PASS: 8 migrations -> gate -> SR06 -> SR07; closed gate and legacy data preserved; new writes verified; temporary database removed",
  );
} finally {
  if (created) sql(`drop database ${database} with (force)`, "postgres");
}
