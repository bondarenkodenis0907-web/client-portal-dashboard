
-- Restrict client permissions for service requests.
-- Clients can read their own requests and submit new ones.
-- Request status changes are reserved for a future staff workflow.

revoke all privileges on table public.service_requests
from public, anon, authenticated;

revoke insert (
  id, user_id, site, system, description,
  priority, status, created_at, updated_at
),
update (
  id, user_id, site, system, description,
  priority, status, created_at, updated_at
)
on table public.service_requests
from anon, authenticated;

grant select on table public.service_requests
to authenticated;

grant insert (
  user_id, site, system, description, priority
)
on table public.service_requests
to authenticated;

drop policy if exists
  "Users can update own service requests"
on public.service_requests;

drop policy if exists
  "Users can delete own service requests"
on public.service_requests;


-- Restrict profile permissions.
-- Clients may change profile details,
-- but not account ownership or creation timestamps.

revoke all privileges on table public.profiles
from public, anon, authenticated;

revoke insert (
  id, full_name, company, job_title,
  created_at, updated_at
),
update (
  id, full_name, company, job_title,
  created_at, updated_at
)
on table public.profiles
from anon, authenticated;

grant select on table public.profiles
to authenticated;

grant insert (
  id, full_name, company, job_title
)
on table public.profiles
to authenticated;

grant update (
  full_name, company, job_title, updated_at
)
on table public.profiles
to authenticated;
