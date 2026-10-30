-- Legacy rows remain nullable; every authenticated creation must supply a key.
alter table public.service_requests add column operation_key uuid;
alter table public.service_requests
  add constraint service_requests_user_operation_key unique (user_id, operation_key);

grant insert (operation_key) on public.service_requests to authenticated;
alter policy "Users can create own service requests" on public.service_requests
  with check ((select auth.uid()) = user_id and operation_key is not null);

-- No elevated privileges: ownership, input checks and event triggers still apply.
create function public.create_service_request(
  p_operation_key uuid,
  p_site text,
  p_system text,
  p_description text,
  p_priority text
)
returns setof public.service_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  stored_request public.service_requests%rowtype;
begin
  if owner_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_operation_key is null then
    raise invalid_parameter_value using message = 'Submission key required';
  end if;

  select * into stored_request from public.service_requests
    where user_id = owner_id and operation_key = p_operation_key;
  if not found then
    insert into public.service_requests
      (user_id, operation_key, site, system, description, priority)
    values (owner_id, p_operation_key, p_site, p_system, p_description, p_priority)
    on conflict (user_id, operation_key) do nothing
    returning * into stored_request;

    if not found then
      -- A concurrent insert may have committed after the previous snapshot.
      -- This separate statement gets a fresh snapshot at READ COMMITTED.
      select * into stored_request from public.service_requests
        where user_id = owner_id and operation_key = p_operation_key;
      if not found then
        raise serialization_failure using message = 'Retry the same submission';
      end if;
    end if;
  end if;

  if stored_request.site is distinct from p_site
    or stored_request.system is distinct from p_system
    or stored_request.description is distinct from p_description
    or stored_request.priority is distinct from p_priority then
    raise sqlstate 'PT409' using message = 'Submission already saved with different details';
  end if;
  -- A replay never updates the row or emits another creation event.
  return next stored_request;
end;
$$;

revoke all on function public.create_service_request(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_service_request(uuid, text, text, text, text)
  to authenticated;
