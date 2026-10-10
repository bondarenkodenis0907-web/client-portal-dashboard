begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users(id, email, raw_user_meta_data) values
('55555555-5555-4555-8555-555555555555', 'engineer-a@example.test', '{}'),
('66666666-6666-4666-8666-666666666666', 'engineer-b@example.test', '{}'),
('77777777-7777-4777-8777-777777777777', 'client-a@example.test', '{"role":"staff"}'),
('88888888-8888-4888-8888-888888888888', 'client-b@example.test', '{}');
insert into public.service_staff values
('55555555-5555-4555-8555-555555555555', 'Engineer A'),
('66666666-6666-4666-8666-666666666666', 'Engineer B');
insert into public.service_requests(id,user_id,site,system,description) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','77777777-7777-4777-8777-777777777777','Office A','CCTV','Camera offline'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','88888888-8888-4888-8888-888888888888','Office B','Access control','Reader offline');

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
select is(private.is_service_staff(), false, 'Editable user metadata cannot grant staff access');
select is((select count(*)::integer from public.service_staff),0,'Client cannot read staff directory');
select is((select count(*)::integer from public.service_requests),1,'Client sees only own request');
select is((select count(*)::integer from public.request_events),1,'Client sees only own history');
select throws_ok($$insert into public.service_staff values ('77777777-7777-4777-8777-777777777777','Impersonator')$$,'42501',null,'Client cannot make themselves staff');
with changed as (update public.service_requests set status='in_progress' returning id)
select is((select count(*)::integer from changed),0,'Client cannot process even their own request');
select throws_ok($$insert into public.service_requests(user_id,site,system,description,status) values ('77777777-7777-4777-8777-777777777777','Fake','CCTV','Fake','closed')$$,'42501',null,'Client cannot insert a pre-closed request');
select throws_ok($$delete from public.request_events$$,'42501',null,'History cannot be removed by a client');

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select is(private.is_service_staff(),true,'Registered staff are recognized');
select is((select count(*)::integer from public.service_requests),2,'Staff see both client requests');
select is((select count(*)::integer from public.service_staff),2,'Staff can choose another engineer');
select throws_ok($$update public.service_requests set status='closed',assigned_to='55555555-5555-4555-8555-555555555555',resolution='Checked and repaired' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23514',null,'Staff cannot skip the in-progress stage');
select throws_ok($$update public.service_requests set status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23514',null,'Starting work requires an engineer');
select throws_ok($$update public.service_requests set user_id='55555555-5555-4555-8555-555555555555' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'Staff cannot change client ownership');
select lives_ok($$update public.service_requests set status='in_progress',assigned_to='55555555-5555-4555-8555-555555555555' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Staff can assign and start work');
select is((select count(*)::integer from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),2,'Starting work records a history entry');
select lives_ok($$update public.service_requests set assigned_to='66666666-6666-4666-8666-666666666666' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Staff can reassign an open request');
select throws_ok($$update public.service_requests set status='closed',resolution='   ' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23514',null,'Closing requires a meaningful resolution');
select lives_ok($$update public.service_requests set status='closed',resolution='Replaced the PoE connector and checked the video feed.' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Staff can close with a resolution');
select ok((select closed_at is not null from public.service_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'Database records closure time');
select throws_ok($$update public.service_requests set status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23514',null,'Closed requests cannot be reopened silently');
select throws_ok($$insert into public.request_events(request_id,status) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','closed')$$,'42501',null,'Staff cannot invent history entries');

set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
select is((select resolution from public.service_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'Replaced the PoE connector and checked the video feed.','Client sees the completed work');
select is((select count(*)::integer from public.request_events),4,'Client sees creation, assignment, reassignment and closure');
reset role;
set local role anon;
select throws_ok($$select * from public.request_events$$,'42501',null,'Signed-out visitors cannot read request history');
reset role;
select * from finish();
rollback;
