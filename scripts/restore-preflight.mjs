// Fail closed on unfamiliar schemas/relations before replacing an owned local
// database. This allowlist is specific to the pinned minimal Supabase profile.
const schemas = new Set([
  "_realtime",
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "pgbouncer",
  "private",
  "public",
  "realtime",
  "storage",
  "supabase_functions",
  "supabase_migrations",
  "vault",
]);
const authTables = [
  "audit_log_entries",
  "custom_oauth_providers",
  "flow_state",
  "identities",
  "instances",
  "mfa_amr_claims",
  "mfa_challenges",
  "mfa_factors",
  "mfa_recovery_code_sets",
  "mfa_recovery_codes",
  "oauth_authorizations",
  "oauth_client_states",
  "oauth_clients",
  "oauth_consents",
  "one_time_tokens",
  "refresh_tokens",
  "saml_providers",
  "saml_relay_states",
  "schema_migrations",
  "scim_tokens",
  "scim_users",
  "sessions",
  "sso_domains",
  "sso_providers",
  "users",
  "webauthn_challenges",
  "webauthn_credentials",
];
const relations = new Map([
  ["private.maintenance_state", { kind: "r", extension: null }],
  ...authTables.map((name) => [`auth.${name}`, { kind: "r", extension: null }]),
  ...["profiles", "service_requests", "service_staff", "request_events"].map(
    (name) => [`public.${name}`, { kind: "r", extension: null }],
  ),
  ...[
    "auth.refresh_tokens_id_seq",
    "public.request_events_id_seq",
    "supabase_functions.hooks_id_seq",
  ].map((name) => [name, { kind: "S", extension: null }]),
  ...[
    "supabase_functions.hooks",
    "supabase_functions.migrations",
    "supabase_migrations.schema_migrations",
  ].map((name) => [name, { kind: "r", extension: null }]),
  ["vault.secrets", { kind: "r", extension: "supabase_vault" }],
  ["vault.decrypted_secrets", { kind: "v", extension: "supabase_vault" }],
  ...["pg_stat_statements", "pg_stat_statements_info"].map((name) => [
    `extensions.${name}`,
    { kind: "v", extension: "pg_stat_statements" },
  ]),
]);
// Only disposable local diagnostics and migration metadata may contain rows.
// Provider credentials, users, sessions, MFA, hook state and all app data must
// be empty. Storage/realtime/net/cron tables are absent in the minimal profile.
const metadata = new Set([
  "auth.audit_log_entries",
  "auth.schema_migrations",
  "supabase_functions.migrations",
  "supabase_migrations.schema_migrations",
]);
export const restoreCatalogSql = `select json_build_object(
  'schemas',(select coalesce(json_agg(nspname order by nspname),'[]') from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'),
  'relations',(select coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'extension',e.extname) order by n.nspname,c.relname),'[]')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_depend d on d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
    left join pg_extension e on e.oid=d.refobjid
    where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and c.relkind in ('r','p','f','m','v','S'))
);`;

export function assertRestoreCatalog(catalog) {
  if (
    !Array.isArray(catalog.schemas) ||
    !Array.isArray(catalog.relations) ||
    catalog.schemas.some((name) => !schemas.has(name))
  )
    throw Error("Refusing restore: unexpected database schema");
  for (const relation of catalog.relations) {
    const expected = relations.get(`${relation.schema}.${relation.name}`);
    if (
      !expected ||
      expected.kind !== relation.kind ||
      expected.extension !== relation.extension
    )
      throw Error("Refusing restore: unexpected database relation");
  }
}

export function assertEmptyRestoreEnvironment(query) {
  const catalog = JSON.parse(query(restoreCatalogSql));
  // Validate before querying table contents; never follow foreign tables or
  // unfamiliar partitioned relations into another data source.
  assertRestoreCatalog(catalog);
  const tables = catalog.relations.filter(
    (r) => r.kind === "r" && !metadata.has(`${r.schema}.${r.name}`),
  );
  if (tables.length) {
    const checks = tables
      .map((r) =>
        r.schema === "private" && r.name === "maintenance_state"
          ? `((select count(*) from private.maintenance_state) <> 1
            or exists(select 1 from private.maintenance_state where singleton is distinct from true or enabled is distinct from false)
            or (select count(*) from pg_attribute where attrelid='private.maintenance_state'::regclass and attnum>0 and not attisdropped) <> 2
            or exists(select 1 from pg_attribute where attrelid='private.maintenance_state'::regclass and attnum>0 and not attisdropped
              and (attname not in ('singleton','enabled') or atttypid <> 'boolean'::regtype)))`
          : r.schema === "auth" && r.name === "flow_state"
            ? // Auth leaves recovery PKCE artifacts after the synthetic user is
              // deleted. Only these unusable, credential-free artifacts are allowed.
              `exists(select 1 from auth.flow_state r where r.user_id is null
            or r.provider_type is distinct from 'recovery'
            or nullif(r.provider_access_token,'') is not null
            or nullif(r.provider_refresh_token,'') is not null
            or exists(select 1 from auth.users u where u.id=r.user_id) limit 1)`
            : `exists(select 1 from "${r.schema}"."${r.name}" limit 1)`,
      )
      .join(" or ");
    if (query(`select (${checks})::text;`).trim() !== "false")
      throw Error(
        "Refusing restore: database contains application, Auth or external integration data",
      );
  }
}

export function replaceEmptyRestoreEnvironment(query, replace) {
  assertEmptyRestoreEnvironment(query);
  return replace();
}
