-- Additive facility directory. Admission and provisioning remain administrative;
-- service staff do not acquire management rights through their queue membership.
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 300),
  created_at timestamptz not null default now()
);
create index sites_name_id_idx on public.sites(name, id);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 300),
  created_at timestamptz not null default now(),
  -- Future request links can enforce both parents with a composite FK.
  unique (site_id, id)
);
create index buildings_site_name_id_idx on public.buildings(site_id, name, id);

create table public.site_memberships (
  site_id uuid not null references public.sites(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (site_id, user_id)
);
create index site_memberships_user_active_idx
  on public.site_memberships(user_id, site_id) where is_active;

alter table public.sites enable row level security;
alter table public.buildings enable row level security;
alter table public.site_memberships enable row level security;
revoke all on public.sites, public.buildings, public.site_memberships
  from public, anon, authenticated;
grant select on public.sites, public.buildings, public.site_memberships
  to authenticated;
grant select, insert, update, delete
  on public.sites, public.buildings, public.site_memberships to service_role;

-- A client can inspect only their own admission. No policy allows self-enrolment.
create policy "Read own admission or staff directory" on public.site_memberships
for select to authenticated using (
  user_id = (select auth.uid()) or (select private.is_service_staff())
);
create policy "Read assigned sites or staff sites" on public.sites
for select to authenticated using (
  (select private.is_service_staff()) or exists (
    select 1 from public.site_memberships m
    where m.site_id = sites.id and m.user_id = (select auth.uid()) and m.is_active
  )
);
create policy "Read buildings of visible sites" on public.buildings
for select to authenticated using (
  exists (select 1 from public.sites s where s.id = buildings.site_id)
);

-- The same write barrier covers administrative writes to the new entities.
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.sites for each statement execute function private.enforce_maintenance();
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.buildings for each statement execute function private.enforce_maintenance();
create trigger maintenance_write_gate before insert or update or delete or truncate
on public.site_memberships for each statement execute function private.enforce_maintenance();
