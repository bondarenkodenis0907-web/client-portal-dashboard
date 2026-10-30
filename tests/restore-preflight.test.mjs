import assert from "node:assert/strict";
import test from "node:test";
import { replaceEmptyRestoreEnvironment } from "../scripts/restore-preflight.mjs";
import {
  restoredSqlTestCount,
  restoredSqlTestPaths,
} from "../scripts/restore-drill.mjs";
import { readFileSync, readdirSync } from "node:fs";
const row = (schema, name, kind = "r", extension = null) => ({
  schema,
  name,
  kind,
  extension,
});
function attempt(catalog, populated = false) {
  let replacements = 0,
    reads = 0;
  const query = (sql) => {
    if (sql.startsWith("select json_build_object"))
      return JSON.stringify(catalog);
    reads++;
    return String(populated);
  };
  let refused = false;
  try {
    replaceEmptyRestoreEnvironment(query, () => replacements++);
  } catch {
    refused = true;
  }
  return { refused, replacements, reads };
}
test("unknown tables (including empty tables), schemas and foreign relations refuse before replacement or data reads", () => {
  for (const catalog of [
    {
      schemas: ["public"],
      relations: [row("public", "review_preservation_probe")],
    },
    { schemas: ["unexpected"], relations: [] },
    { schemas: ["public"], relations: [row("public", "profiles", "f")] },
    { schemas: ["vault"], relations: [row("vault", "secrets", "r", null)] },
  ])
    assert.deepEqual(attempt(catalog), {
      refused: true,
      replacements: 0,
      reads: 0,
    });
});
test("provider, SSO, MFA, hook, Vault and application rows refuse before replacement", () => {
  for (const relation of [
    row("auth", "custom_oauth_providers"),
    row("auth", "sso_providers"),
    row("auth", "mfa_recovery_codes"),
    row("auth", "flow_state"),
    row("supabase_functions", "hooks"),
    row("vault", "secrets", "r", "supabase_vault"),
    row("public", "service_requests"),
  ]) {
    const catalog = { schemas: [relation.schema], relations: [relation] };
    assert.deepEqual(attempt(catalog, true), {
      refused: true,
      replacements: 0,
      reads: 1,
    });
    assert.deepEqual(attempt(catalog, false), {
      refused: false,
      replacements: 1,
      reads: 1,
    });
  }
});
test("explicit platform audit and migration metadata can remain without allowing application data", () => {
  assert.deepEqual(
    attempt(
      {
        schemas: ["auth", "supabase_functions", "supabase_migrations"],
        relations: [
          row("auth", "audit_log_entries"),
          row("auth", "schema_migrations"),
          row("supabase_functions", "migrations"),
          row("supabase_migrations", "schema_migrations"),
        ],
      },
      true,
    ),
    { refused: false, replacements: 1, reads: 0 },
  );
});

test("maintenance is allowed only with a validated disabled singleton; unexpected relation kinds still refuse", () => {
  const catalog = {
    schemas: ["private"],
    relations: [row("private", "maintenance_state")],
  };
  assert.deepEqual(attempt(catalog, false), {
    refused: false,
    replacements: 1,
    reads: 1,
  });
  assert.deepEqual(attempt(catalog, true), {
    refused: true,
    replacements: 0,
    reads: 1,
  });
  assert.equal(
    attempt({
      schemas: ["private"],
      relations: [row("private", "maintenance_state", "f")],
    }).reads,
    0,
  );
});

test("restored SQL count follows the archived test suite and rejects missing or ambiguous plans", () => {
  const files = Object.fromEntries(
    readdirSync(new URL("../supabase/tests/", import.meta.url))
      .filter((n) => n.endsWith(".sql"))
      .map((n) => [
        "supabase/tests/" + n,
        readFileSync(
          new URL("../supabase/tests/" + n, import.meta.url),
        ).toString("base64"),
      ]),
  );
  assert.equal(restoredSqlTestCount(files), 230);
  assert.equal(restoredSqlTestPaths(files).length, 8);
  delete files["supabase/tests/maintenance.test.sql"];
  assert.equal(restoredSqlTestCount(files), 200);
  assert.equal(restoredSqlTestPaths(files).length, 7);
  assert(
    !restoredSqlTestPaths(files).includes(
      "supabase/tests/maintenance.test.sql",
    ),
  );
  assert.throws(() =>
    restoredSqlTestPaths({ "supabase/tests/..\\escape.sql": "" }),
  );
  for (const sql of [
    "select no_plan();",
    "select plan(0);",
    "select plan(1);\nselect plan(2);",
  ])
    assert.throws(() =>
      restoredSqlTestCount({
        "supabase/tests/probe.sql": Buffer.from(sql).toString("base64"),
      }),
    );
  assert.throws(() => restoredSqlTestCount({}));
});
