-- Read-only catalog capture; no application row reads or DDL.

select json_build_object(
'tables',(select json_agg(json_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private')),
'columns',(select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and c.relkind='r' and ((n.nspname='public' and c.relname in ('profiles','service_requests','service_staff','request_events')) or(n.nspname='private' and c.relname='maintenance_state'))),
'constraints',(select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',co.conname,'type',co.contype,'validated',co.convalidated,'definition',pg_get_constraintdef(co.oid)) order by n.nspname,c.relname,co.conname) from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where ((n.nspname='public' and c.relname in ('profiles','service_requests','service_staff','request_events')) or(n.nspname='private' and c.relname='maintenance_state'))),
'indexes',(select json_agg(json_build_object('schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef) order by schemaname,tablename,indexname) from pg_indexes where schemaname in ('public','private') and tablename in ('profiles','service_requests','service_staff','request_events','maintenance_state'))
) as catalog;

select json_build_object(
'policies',(select json_agg(row_to_json(p)) from(select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private') order by schemaname,tablename,policyname)p),
'table_grants',(select json_agg(row_to_json(p)) from(select n.nspname as schema_name,c.relname as table_name,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as role_name,x.privilege_type,x.is_grantable from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl)x where c.relkind='r' and n.nspname in ('public','private') order by 1,2,3,4)p),
'column_grants',(select json_agg(row_to_json(p)) from(select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as role_name,x.privilege_type from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(a.attacl)x where a.attnum>0 and not a.attisdropped and c.relkind='r' and n.nspname in ('public','private') order by 1,2,3,4,5)p),
'schema_grants',(select json_agg(row_to_json(p)) from(select n.nspname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as role_name,x.privilege_type from pg_namespace n cross join lateral aclexplode(n.nspacl)x where n.nspname in ('public','private') order by 1,2,3)p)
) as catalog;

select json_build_object(
'functions',(select json_agg(row_to_json(f)) from(select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,pg_get_function_result(p.oid) as result,l.lanname,p.prosecdef,p.provolatile,p.proconfig,p.prosrc,pg_get_userbyid(p.proowner) as owner,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ('public','private') and p.prokind='f' order by 1,2,3)f),
'triggers',(select json_agg(row_to_json(t)) from(select n.nspname as schema_name,c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname in ('public','private') or(n.nspname='auth' and c.relname='users')) order by 1,2,3)t)
) as catalog;

-- Supplement: index validity and ready state.
select n.nspname as schema_name,c.relname as table_name,ci.relname as index_name,i.indisvalid,i.indisready from pg_index i join pg_class c on c.oid=i.indrelid join pg_class ci on ci.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') order by 1,2,3;

-- Supplement: preserve invisible Unicode characters across transport.
select conname, encode(convert_to(pg_get_constraintdef(oid),'UTF8'),'hex') as definition_hex from pg_constraint where conrelid='public.service_requests'::regclass and conname like '%input_check' order by conname;
