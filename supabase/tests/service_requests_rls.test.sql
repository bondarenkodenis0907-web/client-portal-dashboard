begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('33333333-3333-4333-8333-333333333333', 'request-user-a@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'request-user-b@example.test');

insert into public.service_requests (
  user_id,
  site,
  system,
  description,
  priority
) values
  (
    '33333333-3333-4333-8333-333333333333',
    'Office A',
    'CCTV',
    'Camera offline',
    'high'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'Warehouse B',
    'Access Control',
    'Card reader issue',
    'medium'
  );

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'service_requests'
  ),
  'service_requests has RLS enabled'
);

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $$select user_id
    from public.service_requests
    order by user_id$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid)$$,
  'User A can only read their own service requests'
);

select lives_ok(
  $$insert into public.service_requests (
      user_id,
      site,
      system,
      description,
      priority
    ) values (
      '33333333-3333-4333-8333-333333333333',
      'Office A',
      'Fire Alarm',
      'Panel warning',
      'low'
    )$$,
  'User A can create their own service request'
);

select lives_ok(
  $$update public.service_requests
    set status = 'in_progress'
    where user_id = '33333333-3333-4333-8333-333333333333'
      and description = 'Camera offline'$$,
  'User A can update their own service request'
);

select results_eq(
  $$update public.service_requests
    set description = 'Unauthorized change'
    where user_id = '44444444-4444-4444-8444-444444444444'
    returning user_id$$,
  $$select null::uuid where false$$,
  'User A cannot update User B service request'
);

select results_eq(
  $$delete from public.service_requests
    where user_id = '44444444-4444-4444-8444-444444444444'
    returning user_id$$,
  $$select null::uuid where false$$,
  'User A cannot delete User B service request'
);

reset role;

select is(
  (
    select description
    from public.service_requests
    where user_id = '44444444-4444-4444-8444-444444444444'
  ),
  'Card reader issue',
  'Cross-user update leaves User B request unchanged'
);

select * from finish();

rollback;
