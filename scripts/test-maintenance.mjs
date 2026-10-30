import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
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
function sql(query) {
  const r = spawnSync("docker", args, {
    input: query,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  assert.equal(r.status, 0, "Local maintenance SQL failed");
  return r.stdout.trim();
}
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `maintenance-${randomUUID()}@example.test`,
  password = randomBytes(20).toString("hex");
let userId,
  holder,
  toggle,
  ownsWindow = false;
try {
  assert.equal(
    sql("select enabled from private.maintenance_state where singleton"),
    "f",
    "Do not take over an existing maintenance window",
  );
  ownsWindow = true;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(created.error, null);
  userId = created.data.user.id;
  assert.equal(
    (await client.auth.signInWithPassword({ email, password })).error,
    null,
  );
  const operation = randomUUID();
  const original = await client.rpc("create_service_request", {
    p_operation_key: operation,
    p_site: "Office",
    p_system: "CCTV",
    p_description: "Offline",
    p_priority: "medium",
  });
  assert.equal(original.error, null);
  const requestId = original.data[0].id;

  // A committed switch must wait for an already-admitted writer transaction.
  holder = spawn("docker", args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  holder.stdout.on("data", (b) => (out += b));
  holder.stderr.resume();
  holder.stdin.write(
    "begin; update public.service_requests set status=status where false;\n\\echo ADMITTED\n",
  );
  for (let i = 0; i < 100 && !out.includes("ADMITTED"); i++) await delay(50);
  assert.match(out, /ADMITTED/);
  const toggleArgs = [...args];
  toggle = spawn("docker", toggleArgs, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  toggle.stdout.resume();
  toggle.stderr.resume();
  const toggled = new Promise((resolve) => toggle.once("close", resolve));
  toggle.stdin.end(
    "set application_name='portal_maintenance_test_toggle'; update private.maintenance_state set enabled=true where singleton;",
  );
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    if (
      sql(
        "select count(*) from pg_stat_activity where application_name='portal_maintenance_test_toggle' and wait_event_type='Lock'",
      ) === "1"
    ) {
      waiting = true;
      break;
    }
    await delay(50);
  }
  assert(waiting, "Toggle must wait for admitted transaction");
  holder.stdin.end("commit;\n");
  assert.equal(await toggled, 0);
  toggle = undefined;
  holder = undefined;

  const blocked = async (result) => {
    const r = await result;
    assert.equal(r.status, 503);
    assert.equal(r.error?.code, "PT503");
  };
  await blocked(
    client.from("service_requests").insert({
      user_id: userId,
      operation_key: randomUUID(),
      site: "Office",
      system: "CCTV",
      description: "Old tab",
    }),
  );
  await blocked(
    client.rpc("create_service_request", {
      p_operation_key: randomUUID(),
      p_site: "Office",
      p_system: "CCTV",
      p_description: "Offline",
      p_priority: "medium",
    }),
  );
  await blocked(
    admin
      .from("service_requests")
      .update({ status: "closed" })
      .eq("id", requestId),
  );
  assert.equal(
    (await client.from("service_requests").select("id").eq("id", requestId))
      .data.length,
    1,
  );
  assert(
    (
      await admin.auth.admin.updateUserById(userId, {
        password: randomBytes(20).toString("hex"),
      })
    ).error,
    "Direct Auth password update must fail",
  );
  assert.equal(
    sql(
      `select count(*) from public.request_events where request_id='${requestId}'`,
    ),
    "1",
  );
  sql("update private.maintenance_state set enabled=false where singleton;");
  assert.equal(
    (
      await client.rpc("create_service_request", {
        p_operation_key: operation,
        p_site: "Office",
        p_system: "CCTV",
        p_description: "Offline",
        p_priority: "medium",
      })
    ).error,
    null,
  );
  console.log(
    "PASS: lock barrier, direct REST/RPC HTTP 503, service-role denial, Auth update denial, retained reads/events, reopening and idempotent replay",
  );
} finally {
  if (holder) {
    holder.stdin.end("rollback;\n");
    holder.kill();
  }
  if (toggle) toggle.kill();
  if (ownsWindow)
    sql(
      "set lock_timeout='5s'; update private.maintenance_state set enabled=false where singleton;",
    );
  if (userId)
    assert.equal(
      (await admin.auth.admin.deleteUser(userId)).error,
      null,
      "Synthetic user cleanup failed",
    );
}
