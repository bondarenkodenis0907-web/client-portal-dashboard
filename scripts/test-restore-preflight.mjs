import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  startTarget,
  assertTargetContainer,
  queryLocalDatabase,
  stopTarget,
} from "./restore-target.mjs";
import {
  assertEmptyRestoreEnvironment,
  replaceEmptyRestoreEnvironment,
} from "./restore-preflight.mjs";

// Only this checkout's owned synthetic restore backend is used. The callback
// is a sentinel, never DROP DATABASE. Fixtures are uniquely named and removed.
const suffix = randomUUID().replaceAll("-", "");
const table = `review_preflight_${suffix}`;
const schema = `review_schema_${suffix}`;
const userId = randomUUID();
const flowId = randomUUID();
let query,
  tableCreated = false,
  schemaCreated = false,
  userCreated = false,
  flowCreated = false;
try {
  startTarget();
  const container = assertTargetContainer();
  query = (sql) => queryLocalDatabase(container, sql);
  assertEmptyRestoreEnvironment(query);
  let replacements = 0;
  const replace = () => {
    replacements++;
  };
  replaceEmptyRestoreEnvironment(query, replace);
  assert.equal(replacements, 1);
  replacements = 0;

  query(
    `create table public.${table}(marker integer); insert into public.${table} values (1);`,
  );
  tableCreated = true;
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /unexpected database relation/,
  );
  assert.equal(query(`select count(*) from public.${table};`), "1");
  assert.equal(replacements, 0);
  query(`delete from public.${table};`);
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /unexpected database relation/,
  );
  query(`drop table public.${table};`);
  tableCreated = false;

  query(`create schema ${schema};`);
  schemaCreated = true;
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /unexpected database schema/,
  );
  query(`drop schema ${schema};`);
  schemaCreated = false;

  query(
    `insert into auth.users(id,email) values ('${userId}','review-preflight-${suffix}@example.test');`,
  );
  userCreated = true;
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /contains application, Auth or external integration data/,
  );
  assert.equal(
    query(`select count(*) from auth.users where id='${userId}';`),
    "1",
  );
  assert.equal(replacements, 0);
  query(`delete from auth.users where id='${userId}';`);
  userCreated = false;
  query(`insert into auth.flow_state(id,user_id,provider_type,authentication_method)
    values ('${flowId}','${userId}','recovery','otp');`);
  flowCreated = true;
  assertEmptyRestoreEnvironment(query);
  query(
    `update auth.flow_state set provider_access_token='synthetic-provider-credential' where id='${flowId}';`,
  );
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /contains application, Auth or external integration data/,
  );
  assert.equal(
    query(`select count(*) from auth.flow_state where id='${flowId}';`),
    "1",
  );
  query(
    `update auth.flow_state set provider_access_token=null, provider_type='external' where id='${flowId}';`,
  );
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /contains application, Auth or external integration data/,
  );
  query(
    `update auth.flow_state set provider_type='recovery', user_id=null where id='${flowId}';`,
  );
  assert.throws(
    () => replaceEmptyRestoreEnvironment(query, replace),
    /contains application, Auth or external integration data/,
  );
  assert.equal(replacements, 0);
  query(`delete from auth.flow_state where id='${flowId}';`);
  flowCreated = false;
  assertEmptyRestoreEnvironment(query);
  console.log(
    "PASS: owned restore preflight accepts empty platform state; refuses unknown populated/empty tables, unknown schema and Auth data before replacement; fixture rows preserved.",
  );
} finally {
  try {
    if (query) {
      if (userCreated) query(`delete from auth.users where id='${userId}';`);
      if (flowCreated)
        query(`delete from auth.flow_state where id='${flowId}';`);
      if (tableCreated) query(`drop table public.${table};`);
      if (schemaCreated) query(`drop schema ${schema};`);
    }
  } finally {
    stopTarget();
  }
}
