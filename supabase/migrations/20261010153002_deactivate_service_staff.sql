-- Keep membership rows referenced by requests and history. Only a trusted
-- administrator can change this flag; existing directory grants stay read-only.
alter table public.service_staff
  add column is_active boolean not null default true;

create or replace function private.is_service_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.service_staff
    where user_id = auth.uid() and is_active
  );
$$;

-- Active staff retain read access to inactive directory entries for historical
-- names. Assignment validation therefore belongs in the database, not a select.
create or replace function private.validate_request_processing()
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
  if new.assigned_to is not null and not exists (
    select 1 from public.service_staff
    where user_id = new.assigned_to and is_active
  ) then
    raise exception 'Assign an active staff member before processing the request' using errcode = '23514';
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
