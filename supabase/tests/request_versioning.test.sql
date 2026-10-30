begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users(id, email, raw_user_meta_data) values
 ('07000000-0000-4000-8000-000000000001','sr07-client@example.test','{"role":"staff"}'),
 ('07000000-0000-4000-8000-000000000002','sr07-staff-a@example.test','{}'),
 ('07000000-0000-4000-8000-000000000003','sr07-staff-b@example.test','{}');
insert into public.service_staff(user_id,display_name) values
 ('07000000-0000-4000-8000-000000000002','SR07 A'),
 ('07000000-0000-4000-8000-000000000003','SR07 B');
insert into public.service_requests(id,user_id,site,system,description) values
 ('07000000-0000-4000-8000-000000000010','07000000-0000-4000-8000-000000000001','Office','CCTV','Offline'),
 ('07000000-0000-4000-8000-000000000011','07000000-0000-4000-8000-000000000001','Other','Alarm','Offline');

select ok(not (select prosecdef from pg_proc where oid='public.process_service_request(uuid,integer,uuid,text,text)'::regprocedure), 'Processing RPC retains invoker permissions');
select ok(not has_function_privilege('anon','public.process_service_request(uuid,integer,uuid,text,text)','EXECUTE'), 'Anonymous RPC execution is denied');
select ok(has_function_privilege('authenticated','public.process_service_request(uuid,integer,uuid,text,text)','EXECUTE'), 'Authenticated RPC execution is granted');
select ok(not has_column_privilege('authenticated','public.service_requests','version','UPDATE'), 'Clients cannot set their own saved version');
select ok(not has_column_privilege('authenticated','public.service_requests','version','INSERT'), 'Clients cannot choose an initial version');
select ok(has_column_privilege('authenticated','public.service_requests','expected_version','UPDATE'), 'Direct updates can supply the required concurrency input');
select ok(not has_column_privilege('authenticated','public.service_requests','expected_version','INSERT'), 'Concurrency input cannot be persisted through INSERT');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000010'),1,'Requests start with a positive version');
select ok((select bool_and(expected_version is null) from public.service_requests),'Expected version is not stored');

set local role authenticated;
set local request.jwt.claim.sub='07000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',1,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 '42501',null,'Client metadata cannot grant processing access');
with changed as (update public.service_requests set expected_version=1,status='in_progress',assigned_to='07000000-0000-4000-8000-000000000002' returning id)
select is((select count(*)::integer from changed),0,'Direct versioned PATCH still obeys staff RLS');

set local request.jwt.claim.sub='07000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',null,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 '22023','Expected version required','RPC requires an explicit version');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',0,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 '22023',null,'A nonpositive version is rejected');
select throws_ok($$update public.service_requests set status='in_progress',assigned_to='07000000-0000-4000-8000-000000000002' where id='07000000-0000-4000-8000-000000000010'$$,
 '22023',null,'Legacy direct PATCH without a version cannot bypass the contract');
select throws_ok($$update public.service_requests set expected_version=null,status='in_progress' where id='07000000-0000-4000-8000-000000000010'$$,
 '22023',null,'Explicit null is not a version');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',99,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 'PT409',null,'An invented future version cannot overwrite a row');
select results_eq(
 $$select id from public.process_service_request('07000000-0000-4000-8000-000000000010',1,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 $$select '07000000-0000-4000-8000-000000000010'::uuid$$,'Successful processing returns the request');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000010'),2,'Accepted write increments the version exactly once');
select ok((select expected_version is null from public.service_requests where id='07000000-0000-4000-8000-000000000010'),'Version input is consumed before storing the row');
select is((select count(*)::integer from public.request_events where request_id='07000000-0000-4000-8000-000000000010'),2,'Creation and start each have one event');
create temporary table sr07_before_conflicts as select assigned_to,status,resolution,updated_at,closed_at,version from public.service_requests where id='07000000-0000-4000-8000-000000000010';
select throws_ok($$update public.service_requests set expected_version=1,assigned_to='07000000-0000-4000-8000-000000000003' where id='07000000-0000-4000-8000-000000000010'$$,
 'PT409',null,'Direct stale reassignment is rejected');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',1,'07000000-0000-4000-8000-000000000003','closed','Different repair result')$$,
 'PT409',null,'RPC stale closure is rejected');
select throws_ok($$update public.service_requests set assigned_to='07000000-0000-4000-8000-000000000003' where id='07000000-0000-4000-8000-000000000010' and updated_at=(select updated_at from sr07_before_conflicts)$$,
 '22023',null,'Timestamp filtering alone does not replace the mandatory version input');
select results_eq($$select assigned_to,status,resolution,updated_at,closed_at,version from public.service_requests where id='07000000-0000-4000-8000-000000000010'$$,
 $$select * from sr07_before_conflicts$$,'Rejected writes preserve data, timestamps and version');
select throws_ok($$update public.service_requests set version=3,expected_version=2 where id='07000000-0000-4000-8000-000000000010'$$,
 '42501',null,'Direct writes cannot forge the saved version');
select lives_ok($$update public.service_requests set expected_version=2,assigned_to='07000000-0000-4000-8000-000000000003' where id='07000000-0000-4000-8000-000000000010'$$,
 'Direct PATCH with the current version follows the same contract');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000010'),3,'Direct PATCH also increments the version');
select throws_ok($$update public.service_requests set expected_version=1,assigned_to='07000000-0000-4000-8000-000000000002' where id in ('07000000-0000-4000-8000-000000000010','07000000-0000-4000-8000-000000000011')$$,
 'PT409',null,'A bulk write with any stale row is rejected atomically');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000011'),1,'Bulk failure cannot partially change another row');
select is((select count(*)::integer from public.request_events where request_id='07000000-0000-4000-8000-000000000011'),1,'Bulk failure adds no partial history');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000011',1,'07000000-0000-4000-8000-000000000002','closed','A valid repair result')$$,
 '23514',null,'A correct version cannot bypass workflow transitions');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000011'),1,'Failed validation rolls back the version increment');
select lives_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',3,'07000000-0000-4000-8000-000000000003','closed','Repaired and tested camera')$$,
 'Current-version closure succeeds');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',3,'07000000-0000-4000-8000-000000000002','closed','A conflicting repair result')$$,
 'PT409',null,'Stale closure returns conflict before the closed-row rule');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000010',4,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 '23514',null,'A current version cannot reopen a closed request');
select is((select version from public.service_requests where id='07000000-0000-4000-8000-000000000010'),4,'Rejected closure/reopen leaves the winner version intact');
select is((select resolution from public.service_requests where id='07000000-0000-4000-8000-000000000010'),'Repaired and tested camera','The winning resolution is preserved');
select is((select count(*)::integer from public.request_events where request_id='07000000-0000-4000-8000-000000000010'),4,'Only creation, start, reassignment and closure add history');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000099',1,'07000000-0000-4000-8000-000000000002','in_progress',null)$$,
 'PT404','Request not available','Missing requests use a bounded generic error');
reset role;
update public.service_staff set is_active=false where user_id='07000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub='07000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000011',1,'07000000-0000-4000-8000-000000000003','in_progress',null)$$,
 '42501',null,'Deactivated staff cannot use a previously known valid version');
set local request.jwt.claim.sub='07000000-0000-4000-8000-000000000003';
select lives_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000011',1,null,'new',null)$$,
 'A versioned no-op is an accepted write');
select ok((select version=2 and expected_version is null from public.service_requests where id='07000000-0000-4000-8000-000000000011') and
 (select count(*)=1 from public.request_events where request_id='07000000-0000-4000-8000-000000000011'),
 'A no-op consumes its version without inventing an event');
select throws_ok($$select * from public.process_service_request('07000000-0000-4000-8000-000000000011',1,null,'new',null)$$,
 'PT409',null,'Repeating an already accepted no-op cannot reuse its version');
reset role;
select * from finish();
rollback;
