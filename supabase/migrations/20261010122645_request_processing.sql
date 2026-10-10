create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.service_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120)
);
alter table public.service_staff enable row level security;
revoke all on public.service_staff from public, anon, authenticated;
grant select on public.service_staff to authenticated;

-- The directory is managed by an administrator, never by account metadata.
create function private.is_service_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.service_staff where user_id = auth.uid()
  );
$$;
revoke all on function private.is_service_staff() from public, anon;
grant execute on function private.is_service_staff() to authenticated;

create policy "Staff can read the service directory" on public.service_staff
for select to authenticated using ((select private.is_service_staff()));

alter table public.service_requests
  add column assigned_to uuid references public.service_staff(user_id),
  add column resolution text,
  add column closed_at timestamptz;
create index service_requests_assigned_to_idx on public.service_requests(assigned_to);

grant update (assigned_to, status, resolution) on public.service_requests to authenticated;
create policy "Staff can view the service queue" on public.service_requests
for select to authenticated using ((select private.is_service_staff()));
create policy "Staff can process requests" on public.service_requests
for update to authenticated
using ((select private.is_service_staff()))
with check ((select private.is_service_staff()));

create function private.validate_request_processing()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.is_service_staff() then
    raise exception 'Only service staff can process requests' using errcode = '42501';
  end if;
  if old.status = 'closed' then
    raise exception 'Closed requests cannot be changed' using errcode = '23514';
  end if;
  if new.status <> old.status and not (
    (old.status = 'new' and new.status = 'in_progress') or
    (old.status = 'in_progress' and new.status = 'closed')
  ) then
    raise exception 'Requests must move from new to in progress to closed' using errcode = '23514';
  end if;
  if new.status in ('in_progress', 'closed') and new.assigned_to is null then
    raise exception 'Assign a staff member before starting work' using errcode = '23514';
  end if;
  new.resolution := nullif(btrim(new.resolution), '');
  if new.status = 'closed' and (new.resolution is null or length(new.resolution) < 10) then
    raise exception 'Describe the completed work in at least 10 characters' using errcode = '23514';
  end if;
  if new.status <> 'closed' and new.resolution is not null then
    raise exception 'A resolution is recorded when closing the request' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  new.closed_at := case when new.status = 'closed' then new.updated_at else null end;
  return new;
end;
$$;
revoke all on function private.validate_request_processing() from public, anon, authenticated;
create trigger validate_request_processing before update on public.service_requests
for each row execute function private.validate_request_processing();

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('new', 'in_progress', 'closed')),
  assigned_name text,
  resolution text,
  created_at timestamptz not null default now()
);
create index request_events_request_id_idx on public.request_events(request_id);
alter table public.request_events enable row level security;
revoke all on public.request_events from public, anon, authenticated;
grant select on public.request_events to authenticated;
create policy "Users can read events for visible requests" on public.request_events
for select to authenticated using (exists (
  select 1 from public.service_requests r where r.id = request_id
));

-- Trigger-only writer: clients cannot invent, edit or remove history entries.
create function private.record_request_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null and tg_op = 'UPDATE' then
    raise exception 'A signed-in actor is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.assigned_to is not distinct from old.assigned_to
     and new.resolution is not distinct from old.resolution then
    return new;
  end if;
  insert into public.request_events(request_id, actor_id, status, assigned_name, resolution)
  values (new.id, coalesce(auth.uid(), new.user_id), new.status,
    (select display_name from public.service_staff where user_id = new.assigned_to),
    new.resolution);
  return new;
end;
$$;
revoke all on function private.record_request_event() from public, anon, authenticated;
create trigger record_request_event after insert or update on public.service_requests
for each row execute function private.record_request_event();
