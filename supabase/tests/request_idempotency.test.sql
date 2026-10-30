begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id, email) values
  ('06000000-0000-4000-8000-000000000001', 'sr06-a@example.test'),
  ('06000000-0000-4000-8000-000000000002', 'sr06-b@example.test'),
  ('06000000-0000-4000-8000-000000000003', 'sr06-staff@example.test');
insert into public.service_staff(user_id, display_name) values
  ('06000000-0000-4000-8000-000000000003', 'SR06 engineer');
-- Existing rows and trusted imports remain compatible with the nullable column.
insert into public.service_requests(user_id, site, system, description) values
  ('06000000-0000-4000-8000-000000000001', 'Legacy', 'CCTV', 'Existing request');

select ok(not (select prosecdef from pg_proc where oid =
  'public.create_service_request(uuid,text,text,text,text)'::regprocedure), 'RPC uses invoker permissions');
select ok(not has_function_privilege('anon', 'public.create_service_request(uuid,text,text,text,text)', 'EXECUTE'), 'Anonymous RPC is denied');
select ok(has_function_privilege('authenticated', 'public.create_service_request(uuid,text,text,text,text)', 'EXECUTE'), 'Authenticated RPC is allowed');
select ok(not has_column_privilege('authenticated', 'public.service_requests', 'operation_key', 'UPDATE'), 'Operation keys are immutable to clients and staff');

set local role authenticated;
set local request.jwt.claim.sub = '06000000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.service_requests(user_id,site,system,description)
  values ('06000000-0000-4000-8000-000000000001','Office','CCTV','Offline')$$,
  '42501', null, 'Direct keyless INSERT cannot bypass the contract');
select throws_ok($$select * from public.create_service_request(null,'Office','CCTV','Offline','medium')$$,
  '22023', 'Submission key required', 'RPC requires a key');
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','','CCTV','Offline','medium')$$,
  '23514', null, 'RPC retains database input validation');
select lives_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','CCTV','Offline','medium')$$,
  'Rejected creation did not consume the key');
select is((select count(*)::integer from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010'), 1, 'One request was created');
select results_eq(
  $$select id from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','CCTV','Offline','medium')$$,
  $$select id from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010'$$,
  'Identical replay returns the same ID');
select is((select count(*)::integer from public.request_events where request_id in
  (select id from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010')), 1, 'Replay adds no event');
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Other','CCTV','Offline','medium')$$,
  'PT409', 'Submission already saved with different details', 'Changed site conflicts');
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','Fire','Offline','medium')$$,
  'PT409', null, 'Changed system conflicts');
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','CCTV','Different','medium')$$,
  'PT409', null, 'Changed description conflicts');
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','CCTV','Offline','high')$$,
  'PT409', null, 'Changed priority conflicts');
select throws_ok($$insert into public.service_requests(operation_key,user_id,site,system,description) values
  ('06000000-0000-4000-8000-000000000010','06000000-0000-4000-8000-000000000001','Office','CCTV','Offline')$$,
  '23505', null, 'Direct duplicate INSERT is also prevented');
select throws_ok($$insert into public.service_requests(operation_key,user_id,site,system,description) values
  ('06000000-0000-4000-8000-000000000020','06000000-0000-4000-8000-000000000002','Office','CCTV','Offline')$$,
  '42501', null, 'A caller cannot create for another user');
select throws_ok($$update public.service_requests set expected_version=version, operation_key=gen_random_uuid()$$,
  '42501', null, 'A caller cannot rotate saved keys');
select lives_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000011','Office','CCTV','Offline','medium')$$,
  'An explicit new operation can create a separate identical issue');

set local request.jwt.claim.sub = '06000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010'), 0, 'Another user cannot look up the pending request');
select lives_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000010','Other user','Fire','Alarm','high')$$,
  'Keys are scoped by owner; another user creates only their own record');
select is((select site from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010'), 'Other user', 'Other user sees only their own result');

set local request.jwt.claim.sub = '06000000-0000-4000-8000-000000000003';
update public.service_requests set expected_version=version, status='in_progress', assigned_to='06000000-0000-4000-8000-000000000003'
  where user_id='06000000-0000-4000-8000-000000000001' and operation_key='06000000-0000-4000-8000-000000000010';
update public.service_requests set expected_version=version, status='closed', resolution='Fixed camera connection'
  where user_id='06000000-0000-4000-8000-000000000001' and operation_key='06000000-0000-4000-8000-000000000010';
set local request.jwt.claim.sub = '06000000-0000-4000-8000-000000000001';
select is((select status from public.create_service_request('06000000-0000-4000-8000-000000000010','Office','CCTV','Offline','medium')), 'closed', 'Replay after staff processing returns current state');
select is((select count(*)::integer from public.request_events where request_id in
  (select id from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010')), 3, 'Replay cannot mutate a closed request or add events');
select is((select description from public.service_requests where operation_key='06000000-0000-4000-8000-000000000010'), 'Offline', 'Conflicts leave the original payload intact');
select is((select count(*)::integer from public.service_requests where operation_key is null), 1, 'Legacy request remains readable');
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.create_service_request('06000000-0000-4000-8000-000000000099','Office','CCTV','Offline','medium')$$,
  '42501', 'Authentication required', 'Missing user identity is rejected');
reset role;
select * from finish();
rollback;
