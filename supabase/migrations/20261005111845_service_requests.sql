create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site text not null,
  system text not null,
  description text not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_requests_user_id_idx
  on public.service_requests (user_id);

alter table public.service_requests enable row level security;

revoke all on table public.service_requests from anon;

grant select, insert, update, delete
  on table public.service_requests
  to authenticated;

create policy "Users can view own service requests"
on public.service_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own service requests"
on public.service_requests
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own service requests"
on public.service_requests
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own service requests"
on public.service_requests
for delete
to authenticated
using ((select auth.uid()) = user_id);
