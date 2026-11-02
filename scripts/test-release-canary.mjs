import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { runLocal, projectId } from "./local-tests.mjs";

const status = await runLocal("verify");
const args = [
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
];
function sql(input) {
  const r = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  assert.equal(r.status, 0, "Local canary SQL failed");
  return r.stdout.trim();
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const users = [];
let ownsWindow = false,
  child,
  waitingWrite;
try {
  assert.equal(
    sql("select enabled from private.maintenance_state where singleton"),
    "f",
    "Refuse an existing maintenance window",
  );
  for (let i = 0; i < 3; i++) {
    const email = `release-canary-${randomUUID()}@example.test`,
      password = randomUUID();
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.equal(r.error, null);
    users.push({ ...r.data.user, password });
  }
  assert.equal(
    (
      await admin
        .from("service_staff")
        .insert({ user_id: users[1].id, display_name: "Canary engineer" })
    ).error,
    null,
  );
  assert.equal((await client.auth.signInWithPassword(users[2])).error, null);
  sql("update private.maintenance_state set enabled=true where singleton;");
  ownsWindow = true;
  const text = readFileSync("scripts/release-canary.sql", "utf8");
  const [lock, probes] = text.split("-- CANARY_WRITE_PROBES");
  assert(probes);
  async function openCanary(operation) {
    child = spawn(
      "docker",
      [
        ...args,
        "-v",
        `canary_client=${users[0].id}`,
        "-v",
        `canary_staff=${users[1].id}`,
        "-v",
        `canary_outsider=${users[2].id}`,
        "-v",
        `canary_operation=${operation}`,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (b) => {
      output += b;
    });
    child.stderr.resume();
    child.stdin.write(lock + "\n\\echo LOCKED\n");
    for (let i = 0; i < 100 && !output.includes("LOCKED"); i++) await delay(20);
    assert(output.includes("LOCKED"), "Canary did not lock the gate");
    assert.equal(
      sql("select enabled from private.maintenance_state where singleton"),
      "t",
    );
    return child;
  }
  const operation = randomUUID(),
    foreignOperation = randomUUID();
  const canary = await openCanary(operation);
  let returned = false;
  waitingWrite = client
    .rpc("create_service_request", {
      p_operation_key: foreignOperation,
      p_site: "Blocked outsider",
      p_system: "CCTV",
      p_description: "Cannot enter the canary window",
      p_priority: "medium",
    })
    .retry(false)
    .then((r) => {
      returned = true;
      return r;
    });
  let locked = false;
  for (let i = 0; i < 50; i++) {
    locked =
      Number(
        sql(
          "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%create_service_request%'",
        ),
      ) > 0;
    if (locked) break;
    await delay(20);
  }
  assert(locked && !returned, "External API writer must wait, never pass");
  const closed = new Promise((r) => canary.once("close", r));
  canary.stdin.end(probes);
  assert.equal(await closed, 0, "Canary must commit with the gate closed");
  child = undefined;
  const blocked = await waitingWrite;
  waitingWrite = undefined;
  assert.equal(blocked.status, 503);
  assert.equal(blocked.error.code, "PT503");
  assert.equal(
    sql("select enabled from private.maintenance_state where singleton"),
    "t",
  );
  assert.equal(
    sql(
      `select version from public.service_requests where operation_key='${operation}'`,
    ),
    "3",
  );
  assert.equal(
    sql(
      `select count(*) from public.service_requests where operation_key='${foreignOperation}'`,
    ),
    "0",
  );
  // Disconnect an unfinished transaction: its uncommitted false must roll back.
  const aborted = await openCanary(randomUUID());
  const rolledBack = new Promise((r) => aborted.once("close", r));
  aborted.stdin.end();
  assert.equal(await rolledBack, 0);
  child = undefined;
  assert.equal(
    sql("select enabled from private.maintenance_state where singleton"),
    "t",
  );
  console.log(
    "PASS: DB-only canary, RLS/replay/CAS/history, closed external observer, blocked HTTP writer, rollback leaves gate closed",
  );
} finally {
  if (child && child.exitCode === null) {
    const closed = new Promise((r) => child.once("close", r));
    child.stdin.end("rollback;\n");
    await closed;
  }
  if (waitingWrite) await waitingWrite;
  if (ownsWindow)
    sql("update private.maintenance_state set enabled=false where singleton;");
  for (const user of users)
    assert.equal(
      (await admin.auth.admin.deleteUser(user.id)).error,
      null,
      "Canary fixture cleanup failed",
    );
}
