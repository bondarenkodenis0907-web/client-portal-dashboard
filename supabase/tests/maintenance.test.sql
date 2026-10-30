begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users(id,email) values
('09000000-0000-4000-8000-000000000001','maintenance-client@example.test'),
('09000000-0000-4000-8000-000000000002','maintenance-staff@example.test');
insert into public.service_staff(user_id,display_name) values
('09000000-0000-4000-8000-000000000002','Maintenance test');
set local role authenticated;
set local request.jwt.claim.sub = '09000000-0000-4000-8000-000000000001';
select lives_ok($$select * from public.create_service_request('09000000-0000-4000-8000-000000000010','Office','CCTV','Offline','medium')$$,'Writes work before maintenance');
reset role;
update private.maintenance_state set enabled=true where singleton;

select throws_ok(format('update %s set %I=%I where false', tbl, col, col),
 'PT503', null, 'Even empty UPDATE is blocked: '||tbl)
from (values ('public.profiles','id'),('public.service_requests','id'),('public.request_events','status'),('public.service_staff','user_id'),('auth.users','id')) as t(tbl,col);
select throws_ok('delete from '||tbl||' where false','PT503',null,'DELETE blocked: '||tbl)
from unnest(array['public.profiles','public.service_requests','public.request_events','public.service_staff','auth.users']) as tbl;
select throws_ok('truncate '||tbl||' cascade','PT503',null,'TRUNCATE blocked: '||tbl)
from unnest(array['public.profiles','public.service_requests','public.request_events','public.service_staff','auth.users']) as tbl;
select throws_ok($$insert into auth.users(id) values(gen_random_uuid())$$,'PT503',null,'Signup cannot change users');

set local role authenticated;
set local request.jwt.claim.sub = '09000000-0000-4000-8000-000000000001';
select throws_ok($$update private.maintenance_state set enabled=false$$,'42501',null,'Client cannot reopen writes');
select throws_ok($$select private.enforce_maintenance()$$,'42501',null,'Private definer cannot be called by client');
select lives_ok($$select * from public.service_requests$$,'Owner can still read through RLS');
select throws_ok($$insert into public.service_requests(user_id,operation_key,site,system,description) values('09000000-0000-4000-8000-000000000001',gen_random_uuid(),'Office','CCTV','Offline')$$,'PT503',null,'Direct API insert / stale browser is blocked');
select throws_ok($$select * from public.create_service_request('09000000-0000-4000-8000-000000000011','Office','CCTV','Offline','medium')$$,'PT503',null,'Creation RPC blocked');
set local request.jwt.claim.sub = '09000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.process_service_request((select id from public.service_requests where operation_key='09000000-0000-4000-8000-000000000010'),1,'09000000-0000-4000-8000-000000000002','in_progress',null)$$,'PT503',null,'Processing RPC blocked');
reset role;
set local role service_role;
select throws_ok($$update public.service_requests set status='closed' where false$$,'PT503',null,'Privileged API role cannot bypass gate');
select throws_ok($$update private.maintenance_state set enabled=false$$,'42501',null,'Service role cannot toggle gate');
reset role;
select is((select count(*)::integer from public.service_requests where operation_key='09000000-0000-4000-8000-000000000010'),1,'Original request retained');
select is((select count(*)::integer from public.request_events where request_id in(select id from public.service_requests where operation_key='09000000-0000-4000-8000-000000000010')),1,'Rejected writes created no events');
update private.maintenance_state set enabled=false where singleton;
set local role authenticated;
set local request.jwt.claim.sub = '09000000-0000-4000-8000-000000000001';
select lives_ok($$select * from public.create_service_request('09000000-0000-4000-8000-000000000011','Office','CCTV','Offline','medium')$$,'Removing maintenance restores creation');
set local request.jwt.claim.sub = '09000000-0000-4000-8000-000000000002';
select lives_ok($$select * from public.process_service_request((select id from public.service_requests where operation_key='09000000-0000-4000-8000-000000000010'),1,'09000000-0000-4000-8000-000000000002','in_progress',null)$$,'Removing maintenance restores processing');
reset role;
delete from private.maintenance_state;
select throws_ok($$update public.service_requests set status=status where false$$,'PT503',null,'Missing switch fails closed');
select * from finish();
rollback;
