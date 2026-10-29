set search_path = '';
create function pg_temp.restore_inventory() returns jsonb language plpgsql as $$
declare
  item record;
  rows jsonb;
  content jsonb := '{}'::jsonb;
begin
  for item in select schemaname, tablename from pg_catalog.pg_tables
    where schemaname in ('public','private','auth','supabase_migrations') order by schemaname,tablename
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from %I.%I t', item.schemaname,item.tablename) into rows;
    content := content || jsonb_build_object(item.schemaname||'.'||item.tablename,rows);
  end loop;
  return jsonb_build_object(
    'data',content,
    'tables',(select jsonb_agg(to_jsonb(t) order by t.schema,t.name) from (
      select n.nspname as schema,c.relname as name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','auth','supabase_migrations') and c.relkind in ('r','p','v','S'))t),
    'columns',(select jsonb_agg(to_jsonb(t) order by t.table_schema,t.table_name,t.ordinal_position) from (
      select table_schema,table_name,column_name,row_number() over(partition by table_schema,table_name order by ordinal_position) as ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,is_identity,identity_generation,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,is_generated,generation_expression
      from information_schema.columns where table_schema in ('public','private','auth','supabase_migrations'))t),
    'policies',(select jsonb_agg(to_jsonb(t) order by t.schemaname,t.tablename,t.policyname) from pg_policies t where schemaname in ('public','private')),
    'functions',(select jsonb_agg(to_jsonb(t) order by t.schema,t.name,t.args) from (
      select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as args,pg_get_functiondef(p.oid) as definition,pg_get_userbyid(p.proowner) as owner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth') and p.prokind='f')t),
    'function_grants',(select jsonb_agg(to_jsonb(t) order by t.schema,t.name,t.args,t.grantee,t.privilege_type) from (
      select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as args,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,a.privilege_type,a.is_grantable
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('public','private','auth'))t),
    'column_grants',(select jsonb_agg(to_jsonb(t) order by t.table_schema,t.table_name,t.column_name,t.grantee,t.privilege_type) from information_schema.column_privileges t where table_schema in ('public','private','auth')),
    'table_grants',(select jsonb_agg(to_jsonb(t) order by t.table_schema,t.table_name,t.grantee,t.privilege_type) from information_schema.table_privileges t where table_schema in ('public','private','auth')),
    'schema_grants',(select jsonb_agg(to_jsonb(t) order by t.schema,t.grantee,t.privilege_type) from (
      select n.nspname as schema,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,a.privilege_type,a.is_grantable from pg_namespace n
      cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname in ('public','private','auth'))t),
    'triggers',(select jsonb_agg(to_jsonb(t) order by t.schema,t.table_name,t.name) from (
      select n.nspname as schema,c.relname as table_name,g.tgname as name,g.tgenabled,pg_get_triggerdef(g.oid) as definition from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','auth') and not g.tgisinternal)t),
    'constraints',(select jsonb_agg(to_jsonb(t) order by t.schema,t.table_name,t.name) from (
      select n.nspname as schema,c.relname as table_name,k.conname as name,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','supabase_migrations'))t),
    'roles',(select jsonb_agg(to_jsonb(t) order by t.rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles)t),
    'role_memberships',(select jsonb_agg(to_jsonb(t) order by t.role,t.member,t.grantor) from (
      select pg_get_userbyid(roleid) as role,pg_get_userbyid(member) as member,pg_get_userbyid(grantor) as grantor,admin_option,inherit_option,set_option from pg_auth_members)t),
    'sequence',(select jsonb_build_object('last_value',last_value,'is_called',is_called) from public.request_events_id_seq)
  );
end;
$$;
select pg_temp.restore_inventory();
