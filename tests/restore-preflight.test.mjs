import assert from "node:assert/strict";
import test from "node:test";
import { replaceEmptyRestoreEnvironment } from "../scripts/restore-preflight.mjs";
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
