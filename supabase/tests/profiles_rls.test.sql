begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'user-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'user-b@example.test');

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
  ),
  'profiles has RLS enabled'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'User A can only read their own profile'
);

select lives_ok(
  $$update public.profiles
    set full_name = 'User A Updated'
    where id = '11111111-1111-4111-8111-111111111111'::uuid$$,
  'User A can update their own profile'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'User B can only read their own profile'
);

select results_eq(
  $$update public.profiles
    set full_name = 'Hacked'
    where id = '11111111-1111-4111-8111-111111111111'::uuid
    returning id$$,
  $$select null::uuid where false$$,
  'User B cannot update User A profile'
);

reset role;

select is(
  (
    select full_name
    from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'::uuid
  ),
  'User A Updated',
  'Cross-user update leaves User A profile unchanged'
);

select * from finish();

rollback;
