
begin;

create extension if not exists pgtap
with schema extensions;

select plan(12);

-- Create two isolated test accounts.

insert into auth.users (id, email)
values
  (
    '33333333-3333-4333-8333-333333333333',
    'request-user-a@example.test'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'request-user-b@example.test'
  );

insert into public.service_requests (
  user_id,
  site,
  system,
  description,
  priority
)
values
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

-- Security configuration.

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.service_requests'::regclass
  ),
  'RLS is enabled'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.service_requests',
    'SELECT'
  ),
  'Authenticated users can read requests'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.service_requests',
    'site',
    'INSERT'
  ),
  'Clients can submit requests'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.service_requests',
    'status',
    'INSERT'
  ),
  'Clients cannot choose request status'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.service_requests',
    'created_at',
    'INSERT'
  ),
  'Clients cannot set creation timestamps'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.service_requests',
    'UPDATE'
  ),
  'Clients cannot update requests'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.service_requests',
    'DELETE'
  ),
  'Clients cannot delete requests'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.service_requests',
    'TRUNCATE'
  ),
  'Clients cannot truncate request history'
);

-- Simulate User A.

set local role authenticated;
set local request.jwt.claim.sub =
  '33333333-3333-4333-8333-333333333333';

select results_eq(
  $$
    select user_id
    from public.service_requests
    order by user_id
  $$,
  $$
    values (
      '33333333-3333-4333-8333-333333333333'::uuid
    )
  $$,
  'User A sees only their own requests'
);

select lives_ok(
  $$
    insert into public.service_requests (
      user_id,
      site,
      system,
      description,
      priority
    )
    values (
      '33333333-3333-4333-8333-333333333333',
      'Office A',
      'Fire Alarm',
      'Panel warning',
      'low'
    )
  $$,
  'User A can create a new request'
);

select results_eq(
  $$
    select count(*)::integer
    from public.service_requests
    where user_id =
      '44444444-4444-4444-8444-444444444444'
  $$,
  $$ values (0) $$,
  'User A cannot see User B requests'
);

reset role;

-- Verify another user's data remains unchanged.

select is(
  (
    select description
    from public.service_requests
    where user_id =
      '44444444-4444-4444-8444-444444444444'
  ),
  'Card reader issue',
  'User B request is unchanged'
);

select * from finish();

rollback;
