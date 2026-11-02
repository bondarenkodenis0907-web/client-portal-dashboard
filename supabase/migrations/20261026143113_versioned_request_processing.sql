-- A version is a concurrency token, not a reconstruction of past history.
alter table public.service_requests
  add column version integer not null default 1 check (version > 0),
  add column expected_version integer,
  add constraint service_requests_expected_version_transient check (expected_version is null);

-- Direct Data API writes must follow the same contract as the invoker RPC.
-- The BEFORE trigger consumes this input; it is always NULL in stored rows.
grant update (expected_version) on public.service_requests to authenticated;

create function private.check_request_version()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.is_service_staff() then
    raise insufficient_privilege using message = 'Only service staff can process requests';
  end if;
  if new.expected_version is null or new.expected_version < 1 then
    raise invalid_parameter_value using message = 'Expected version required';
  end if;
  if new.expected_version <> old.version then
    raise sqlstate 'PT409' using message = 'This request changed. Load the latest saved details before trying again.';
  end if;
  new.version := old.version + 1;
  new.expected_version := null;
  return new;
end;
$$;
revoke all on function private.check_request_version() from public, anon, authenticated;

-- PostgreSQL orders same-kind triggers by name. Check the version before
-- validate_request_processing so stale writes (including closure) return 409.
create trigger check_request_version before update on public.service_requests
for each row execute function private.check_request_version();

create function public.process_service_request(
  p_request_id uuid,
  p_expected_version integer,
  p_assigned_to uuid,
  p_status text,
  p_resolution text
)
returns setof public.service_requests
language plpgsql security invoker set search_path = ''
as $$
declare
  saved_request public.service_requests%rowtype;
begin
  if not private.is_service_staff() then
    raise insufficient_privilege using message = 'Only service staff can process requests';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'Expected version required';
  end if;
  update public.service_requests
    set expected_version = p_expected_version,
        assigned_to = p_assigned_to,
        status = p_status,
        resolution = p_resolution
    where id = p_request_id
    returning * into saved_request;
  if not found then
    raise sqlstate 'PT404' using message = 'Request not available';
  end if;
  return next saved_request;
end;
$$;
revoke all on function public.process_service_request(uuid, integer, uuid, text, text)
  from public, anon;
grant execute on function public.process_service_request(uuid, integer, uuid, text, text)
  to authenticated;
