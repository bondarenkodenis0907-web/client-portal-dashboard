begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users(id, email, raw_user_meta_data) values
('11111111-1111-4111-8111-111111111111', 'revoked-engineer@example.test', '{"role":"staff"}'),
('22222222-2222-4222-8222-222222222222', 'active-engineer@example.test', '{}'),
('33333333-3333-4333-8333-333333333333', 'deactivation-client@example.test', '{}');
insert into public.service_staff(user_id, display_name) values
('11111111-1111-4111-8111-111111111111', 'Original Engineer'),
('22222222-2222-4222-8222-222222222222', 'Active Engineer');
insert into public.service_requests(id, user_id, site, system, description) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'Own office', 'CCTV', 'Own camera is offline'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '33333333-3333-4333-8333-333333333333', 'Queued office', 'CCTV', 'Queued camera is offline'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '33333333-3333-4333-8333-333333333333', 'Completed office', 'CCTV', 'Completed camera repair'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '33333333-3333-4333-8333-333333333333', 'Working office', 'CCTV', 'Camera repair in progress');

select is((select bool_and(is_active) from public.service_staff), true, 'Existing-style directory inserts default to active membership');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","user_metadata":{"role":"staff"}}';
select is(private.is_service_staff(), true, 'Directory membership grants the initial staff role');
select lives_ok($$update public.service_requests set assigned_to='11111111-1111-4111-8111-111111111111', status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'$$, 'Staff can start the request that will become historical');
select lives_ok($$update public.service_requests set status='closed', resolution='Replaced the camera and verified the video feed.' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'$$, 'Staff can close the historical request');
select lives_ok($$update public.service_requests set assigned_to='11111111-1111-4111-8111-111111111111', status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'$$, 'Staff can start the request that will need reassignment');
reset role;
create temporary table closed_request_before as
select assigned_to, status, resolution, closed_at, updated_at
from public.service_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
select lives_ok($$update public.service_staff set is_active=false where user_id='11111111-1111-4111-8111-111111111111'$$, 'Administrator can deactivate staff with open and closed assignments');
select is((select display_name from public.service_staff where user_id='11111111-1111-4111-8111-111111111111'), 'Original Engineer', 'Deactivation preserves the referenced directory row and name');
select results_eq(
  $$select assigned_to, status, resolution, closed_at, updated_at from public.service_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'$$,
  $$select assigned_to, status, resolution, closed_at, updated_at from closed_request_before$$,
  'Deactivation does not change the closed request or its timestamps'
);
select is((select assigned_name from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' and status='closed'), 'Original Engineer', 'Closed history retains the original engineer name');
select is((select count(*)::integer from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 3, 'Deactivation does not add or delete request history');

-- Keep the same subject and claims: revocation must not need a new JWT.
set local role authenticated;
select is(private.is_service_staff(), false, 'Existing JWT loses staff access after directory deactivation');
select is((select count(*)::integer from public.service_staff), 0, 'Inactive staff cannot read the directory');
select is((select count(*)::integer from public.service_requests), 1, 'Inactive staff retain only their own client request');
select is((select count(*)::integer from public.request_events), 1, 'Inactive staff retain only their own client history');
select is((select count(*)::integer from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 0, 'Inactive staff cannot read another client historical events');
with changed as (update public.service_requests set assigned_to='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' returning id)
select is((select count(*)::integer from changed), 0, 'Inactive staff cannot update the service queue');
with changed as (update public.service_requests set assigned_to='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning id)
select is((select count(*)::integer from changed), 0, 'Inactive staff cannot process even their own client request');
select throws_ok($$update public.service_staff set is_active=true where user_id='11111111-1111-4111-8111-111111111111'$$, '42501', null, 'Inactive staff cannot reactivate themselves');
select throws_ok($$insert into public.service_staff(user_id, display_name) values ('33333333-3333-4333-8333-333333333333', 'Impersonator')$$, '42501', null, 'Inactive staff cannot create a staff membership');
select lives_ok($$insert into public.service_requests(user_id, site, system, description) values ('11111111-1111-4111-8111-111111111111', 'Own second office', 'CCTV', 'Second own camera is offline')$$, 'Inactive staff can submit requests as a client');
select is((select count(*)::integer from public.service_requests), 2, 'Client submission remains visible to the inactive account');
select is((select count(*)::integer from public.request_events), 2, 'Client submission records visible own history');
select is(private.is_service_staff(), false, 'Editable staff metadata cannot restore a deactivated role');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","user_metadata":{}}';
select is(private.is_service_staff(), true, 'Active directory membership works without staff metadata');
select is((select count(*)::integer from public.service_staff), 2, 'Active staff can read active and inactive directory entries');
select is((select display_name from public.service_staff where not is_active), 'Original Engineer', 'Active staff can resolve historical names of inactive members');
select throws_ok($$update public.service_requests set assigned_to='11111111-1111-4111-8111-111111111111' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$, '23514', 'Assign an active staff member before processing the request', 'Direct authenticated writes cannot assign an inactive engineer');
select throws_ok($$update public.service_requests set assigned_to='11111111-1111-4111-8111-111111111111', status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$, '23514', 'Assign an active staff member before processing the request', 'Direct authenticated writes cannot start work with an inactive engineer');
select throws_ok($$update public.service_requests set status='closed', resolution='Repaired and verified the camera connection.' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'$$, '23514', 'Assign an active staff member before processing the request', 'Direct authenticated writes cannot close work still assigned to inactive staff');
select is((select status from public.service_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'), 'in_progress', 'Rejected closure leaves the original request status intact');
select is((select count(*)::integer from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'), 2, 'Rejected closure does not record a history event');
select lives_ok($$update public.service_requests set assigned_to='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'$$, 'Active staff can reassign an open request from an inactive engineer');
select lives_ok($$update public.service_requests set status='closed', resolution='Repaired and verified the camera connection.' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'$$, 'Reassigned work can be closed by active staff');
select is((select assigned_name from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' and status='closed'), 'Active Engineer', 'New closure records the replacement engineer name');
select throws_ok($$update public.service_requests set assigned_to='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'$$, '23514', 'Closed requests cannot be changed', 'Historical closed assignment remains immutable after deactivation');
select throws_ok($$update public.service_staff set is_active=true where user_id='11111111-1111-4111-8111-111111111111'$$, '42501', null, 'Active staff cannot reactivate another engineer');
select throws_ok($$delete from public.service_staff where user_id='11111111-1111-4111-8111-111111111111'$$, '42501', null, 'Active staff cannot remove historical memberships');
reset role;
select lives_ok($$update public.service_staff set is_active=true where user_id='11111111-1111-4111-8111-111111111111'$$, 'Administrator can reactivate the preserved membership');
select throws_ok($$update public.service_staff set is_active=null where user_id='11111111-1111-4111-8111-111111111111'$$, '23502', null, 'Membership activity cannot be null');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","user_metadata":{"role":"staff"}}';
select is(private.is_service_staff(), true, 'The same account regains the role after administrator reactivation');
select is((select count(*)::integer from public.service_staff), 2, 'Reactivated staff regain directory access');
select is((select count(*)::integer from public.service_requests), 5, 'Reactivated staff regain access to the service queue');
select ok(exists(select 1 from public.request_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 'Reactivated staff regain access to other client history');
select lives_ok($$update public.service_requests set assigned_to='11111111-1111-4111-8111-111111111111' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$, 'Reactivated members can receive open assignments');
select lives_ok($$update public.service_requests set status='in_progress' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$, 'Work can start with a reactivated assignee');
reset role;
set local role anon;
select throws_ok($$select * from public.service_staff$$, '42501', null, 'Signed-out callers cannot read the service directory');
reset role;
select * from finish();
rollback;
