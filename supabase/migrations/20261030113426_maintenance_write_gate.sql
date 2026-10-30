create table private.maintenance_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.maintenance_state (singleton) values (true);
alter table private.maintenance_state enable row level security;
revoke all on private.maintenance_state from public, anon, authenticated, service_role;

-- The definer can read/lock this private row; callers cannot change the switch.
-- Shared locks live until commit. Enabling waits for admitted writes to finish;
-- writes arriving behind the switch see the committed enabled value.
create function private.enforce_maintenance()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  blocked boolean;
begin
  select enabled into blocked from private.maintenance_state
    where singleton for share;
  if blocked is distinct from false then
    raise sqlstate 'PT503' using message = 'Portal temporarily unavailable. Please try again later.';
  end if;
  return null;
end;
$$;
revoke all on function private.enforce_maintenance() from public, anon, authenticated, service_role;

create trigger maintenance_write_gate before insert or update or delete or truncate
on public.profiles for each statement execute function private.enforce_maintenance();
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.service_requests for each statement execute function private.enforce_maintenance();
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.request_events for each statement execute function private.enforce_maintenance();
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.service_staff for each statement execute function private.enforce_maintenance();
-- Includes signup, password updates and account deletion, even via direct Auth.
create trigger maintenance_write_gate before insert or update or delete or truncate
on auth.users for each statement execute function private.enforce_maintenance();
