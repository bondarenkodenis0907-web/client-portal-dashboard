-- Bounded pilot PDF storage is private bytea, atomically versioned with metadata.
-- No manager is provisioned by this migration. Production adoption needs review.
alter table public.sites
 add column customer_name text not null default '' check (length(customer_name)<=160),
 add column contact_name text not null default '' check (length(contact_name)<=120),
 add column contact_email text not null default '' check (length(contact_email)<=200),
 add column contact_phone text not null default '' check (length(contact_phone)<=80),
 add column is_archived boolean not null default false,
 add column version integer not null default 1 check (version>0),
 add column updated_at timestamptz not null default now();

create table public.facility_managers (
 user_id uuid primary key references auth.users(id) on delete restrict,
 is_active boolean not null default true
);
alter table public.facility_managers enable row level security;
revoke all on public.facility_managers from public,anon,authenticated;
grant select on public.facility_managers to authenticated;
grant select,insert,update,delete on public.facility_managers to service_role;
create policy "Read own management admission" on public.facility_managers
 for select to authenticated using (user_id=(select auth.uid()));
create function private.can_manage_facilities() returns boolean
 language sql stable security invoker set search_path='' as $$
 select (select private.is_service_staff()) and exists(
 select 1 from public.facility_managers where user_id=(select auth.uid()) and is_active)
$$;
revoke all on function private.can_manage_facilities() from public,anon;
grant execute on function private.can_manage_facilities() to authenticated;
create function public.can_manage_facilities() returns boolean
 language sql stable security invoker set search_path='' as $$ select private.can_manage_facilities() $$;
revoke all on function public.can_manage_facilities() from public,anon;
grant execute on function public.can_manage_facilities() to authenticated;

create table public.contracts (
 id uuid primary key,
 site_id uuid not null references public.sites(id) on delete restrict,
 revision integer not null default 1 check(revision>0),
 published_version_id uuid,
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id) on delete restrict
);
create index contracts_site_id_idx on public.contracts(site_id,created_at,id);
create table public.contract_versions (
 id uuid primary key,
 contract_id uuid not null references public.contracts(id) on delete restrict,
 version integer not null check(version>0),
 details jsonb not null,
 filename text not null,
 byte_size integer not null check(byte_size between 5 and 2097152),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id) on delete restrict,
 unique(contract_id,version), unique(contract_id,id)
);
alter table public.contracts add constraint contracts_published_version_fkey
 foreign key(id,published_version_id) references public.contract_versions(contract_id,id)
 deferrable initially deferred;
create table private.contract_files (
 version_id uuid primary key references public.contract_versions(id) on delete restrict,
 -- Explicit bounds keep the CHECK expression stable through pg_dump/restore.
 pdf bytea not null check(octet_length(pdf)>=5 and octet_length(pdf)<=2097152 and substring(pdf from 1 for 5)=convert_to('%PDF-','UTF8'))
);
alter table public.contract_versions add constraint contract_versions_file_required
 foreign key(id) references private.contract_files(version_id) deferrable initially deferred;
create table public.contract_events (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.contracts(id) on delete restrict,
 version_id uuid,
 actor_id uuid not null references auth.users(id) on delete restrict,
 event_type text not null check(event_type in ('version_added','published','unpublished')),
 revision integer not null,
 created_at timestamptz not null default now(),
 foreign key(contract_id,version_id) references public.contract_versions(contract_id,id)
);
create index contract_events_contract_id_idx on public.contract_events(contract_id,created_at,id);
alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_events enable row level security;
alter table private.contract_files enable row level security;
revoke all on public.contracts,public.contract_versions,public.contract_events,private.contract_files from public,anon,authenticated;
grant select on public.contracts,public.contract_versions,public.contract_events,private.contract_files to authenticated;
grant select,insert,update,delete on public.contracts,public.contract_versions,public.contract_events,private.contract_files to service_role;
create policy "Read managed or published contracts" on public.contracts for select to authenticated using (
 (select private.can_manage_facilities()) or (published_version_id is not null and exists(select 1 from public.sites s where s.id=site_id))
);
create policy "Read managed or explicitly published versions" on public.contract_versions for select to authenticated using (
 (select private.can_manage_facilities()) or exists(select 1 from public.contracts c where c.id=contract_id and c.published_version_id=contract_versions.id)
);
create policy "Read files for visible versions" on private.contract_files for select to authenticated using (
 exists(select 1 from public.contract_versions v where v.id=version_id)
);
create policy "Management audit only" on public.contract_events for select to authenticated using ((select private.can_manage_facilities()));

-- Private mutation functions are narrowly authorized definer entrypoints. Public
-- wrappers stay invoker; no arbitrary SQL/table/column names come from callers.
create function private.save_site(p_id uuid,p_expected_version integer,p_details jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare r public.sites%rowtype; k text; d jsonb;
begin
 if not private.can_manage_facilities() then raise insufficient_privilege using message='Management admission required'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<0 or jsonb_typeof(p_details) is distinct from 'object' then raise invalid_parameter_value using message='Invalid site'; end if;
 if p_details - array['name','address','customer_name','contact_name','contact_email','contact_phone','is_archived'] <> '{}'::jsonb then raise invalid_parameter_value using message='Unexpected fields'; end if;
 foreach k in array array['name','address','customer_name','contact_name','contact_email','contact_phone'] loop
  if jsonb_typeof(p_details->k) is distinct from 'string' then raise invalid_parameter_value using message='Invalid site field'; end if;
 end loop;
 if jsonb_typeof(p_details->'is_archived') is distinct from 'boolean' then raise invalid_parameter_value using message='Invalid archive state'; end if;
 d=p_details;
 foreach k in array array['name','address','customer_name','contact_name','contact_email','contact_phone'] loop d=jsonb_set(d,array[k],to_jsonb(btrim(d->>k))); end loop;
 if length(d->>'name') not between 1 and 120 or length(d->>'address')>300 or length(d->>'customer_name')>160 or length(d->>'contact_name')>120 or length(d->>'contact_email')>200 or length(d->>'contact_phone')>80 then raise invalid_parameter_value using message='Site field too long or missing'; end if;
 if d->>'contact_email'<>'' and d->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise invalid_parameter_value using message='Invalid email'; end if;
 -- Serialize creation/replay for the same caller-supplied stable identifier.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.sites where id=p_id for update;
 if found then
  if jsonb_build_object('name',r.name,'address',r.address,'customer_name',r.customer_name,'contact_name',r.contact_name,'contact_email',r.contact_email,'contact_phone',r.contact_phone,'is_archived',r.is_archived)=d and r.version in (p_expected_version,p_expected_version+1) then return jsonb_build_object('id',r.id,'revision',r.version); end if;
  if r.version<>p_expected_version then raise sqlstate 'PT409' using message='Site changed; reload saved details'; end if;
  update public.sites set name=d->>'name',address=d->>'address',customer_name=d->>'customer_name',contact_name=d->>'contact_name',contact_email=d->>'contact_email',contact_phone=d->>'contact_phone',is_archived=(d->>'is_archived')::boolean,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 else
  if p_expected_version<>0 then raise sqlstate 'PT404' using message='Site unavailable'; end if;
  insert into public.sites(id,name,address,customer_name,contact_name,contact_email,contact_phone,is_archived) values(p_id,d->>'name',d->>'address',d->>'customer_name',d->>'contact_name',d->>'contact_email',d->>'contact_phone',(d->>'is_archived')::boolean) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'revision',r.version);
end $$;

create function private.save_contract_version(p_contract_id uuid,p_site_id uuid,p_version_id uuid,p_expected_revision integer,p_details jsonb,p_filename text,p_pdf_base64 text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c public.contracts%rowtype; v public.contract_versions%rowtype; bytes bytea; h text; n integer; k text; d jsonb; staff_name text;
begin
 if not private.can_manage_facilities() then raise insufficient_privilege using message='Management admission required'; end if;
 if p_contract_id is null or p_site_id is null or p_version_id is null or p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_details) is distinct from 'object' then raise invalid_parameter_value using message='Invalid contract'; end if;
 if p_details - array['number','title','customer','provider','starts_on','ends_on','state','responsible_id','notes'] <> '{}'::jsonb then raise invalid_parameter_value using message='Unexpected fields'; end if;
 foreach k in array array['number','title','customer','provider','starts_on','ends_on','state','responsible_id','notes'] loop
  if jsonb_typeof(p_details->k) is distinct from 'string' then raise invalid_parameter_value using message='Invalid contract field'; end if;
 end loop;
 d=p_details;
 foreach k in array array['number','title','customer','provider','starts_on','ends_on','state','responsible_id','notes'] loop d=jsonb_set(d,array[k],to_jsonb(btrim(d->>k))); end loop;
 if length(d->>'number') not between 1 and 120 or length(d->>'title') not between 1 and 160 or length(d->>'customer') not between 1 and 160 or length(d->>'provider') not between 1 and 160 or length(d->>'notes')>2000 or d->>'state' not in ('draft','active','ended') then raise invalid_parameter_value using message='Invalid contract details'; end if;
 if d->>'starts_on' !~ '^\d{4}-\d{2}-\d{2}$' or (d->>'ends_on'<>'' and d->>'ends_on' !~ '^\d{4}-\d{2}-\d{2}$') then raise invalid_parameter_value using message='Invalid dates'; end if;
 perform (d->>'starts_on')::date;
 if d->>'ends_on'<>'' and (d->>'ends_on')::date<(d->>'starts_on')::date then raise invalid_parameter_value using message='Invalid period'; end if;
 select display_name into staff_name from public.service_staff where user_id=(d->>'responsible_id')::uuid and is_active;
 if not found then raise invalid_parameter_value using message='Active responsible staff required'; end if;
 d=jsonb_set(d,'{responsible_name}',to_jsonb(staff_name));
 d=jsonb_set(d,'{author_name}',to_jsonb((select display_name from public.service_staff where user_id=auth.uid())));
 if p_filename is null or length(p_filename) not between 5 and 120 or lower(right(p_filename,4))<>'.pdf' or position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 or p_filename ~ '[[:cntrl:]]' or p_pdf_base64 is null or length(p_pdf_base64)>2800000 then raise invalid_parameter_value using message='PDF required, maximum 2 MiB'; end if;
 bytes=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 5 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') then raise invalid_parameter_value using message='PDF required, maximum 2 MiB'; end if;
 h=encode(sha256(bytes),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text,0));
 select * into c from public.contracts where id=p_contract_id for update;
 if found then
  if c.site_id<>p_site_id then raise sqlstate 'PT404' using message='Contract unavailable'; end if;
  select * into v from public.contract_versions where id=p_version_id;
  if found then
   if v.contract_id=p_contract_id and v.details=d and v.filename=p_filename and v.sha256=h then return jsonb_build_object('id',c.id,'version_id',v.id,'revision',c.revision); end if;
   raise sqlstate 'PT409' using message='Operation already used with different details';
  end if;
  if c.revision<>p_expected_revision then raise sqlstate 'PT409' using message='Contract changed; reload saved details'; end if;
  update public.contracts set revision=revision+1 where id=c.id returning * into c;
 else
  if p_expected_revision<>0 then raise sqlstate 'PT404' using message='Contract unavailable'; end if;
  if not exists(select 1 from public.sites where id=p_site_id and not is_archived) then raise invalid_parameter_value using message='Active site required'; end if;
  insert into public.contracts(id,site_id,created_by) values(p_contract_id,p_site_id,auth.uid()) returning * into c;
 end if;
 select coalesce(max(version),0)+1 into n from public.contract_versions where contract_id=c.id;
 insert into public.contract_versions(id,contract_id,version,details,filename,byte_size,sha256,created_by) values(p_version_id,c.id,n,d,p_filename,octet_length(bytes),h,auth.uid());
 insert into private.contract_files(version_id,pdf) values(p_version_id,bytes);
 insert into public.contract_events(contract_id,version_id,actor_id,event_type,revision) values(c.id,p_version_id,auth.uid(),'version_added',c.revision);
 return jsonb_build_object('id',c.id,'version_id',p_version_id,'revision',c.revision);
end $$;

create function private.publish_contract(p_contract_id uuid,p_expected_revision integer,p_version_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c public.contracts%rowtype;
begin
 if not private.can_manage_facilities() then raise insufficient_privilege using message='Management admission required'; end if;
 select * into c from public.contracts where id=p_contract_id for update;
 if not found then raise sqlstate 'PT404' using message='Contract unavailable'; end if;
 if p_expected_revision is null or p_expected_revision<1 then raise invalid_parameter_value using message='Expected revision required'; end if;
 if c.published_version_id is not distinct from p_version_id and c.revision in (p_expected_revision,p_expected_revision+1) then return jsonb_build_object('id',c.id,'revision',c.revision); end if;
 if c.revision<>p_expected_revision then raise sqlstate 'PT409' using message='Contract changed; reload saved details'; end if;
 if p_version_id is not null and not exists(select 1 from public.contract_versions where id=p_version_id and contract_id=c.id) then raise sqlstate 'PT404' using message='Version unavailable'; end if;
 update public.contracts set published_version_id=p_version_id,revision=revision+1 where id=c.id returning * into c;
 insert into public.contract_events(contract_id,version_id,actor_id,event_type,revision) values(c.id,p_version_id,auth.uid(),case when p_version_id is null then 'unpublished' else 'published' end,c.revision);
 return jsonb_build_object('id',c.id,'revision',c.revision);
end $$;

create function public.save_site(p_id uuid,p_expected_version integer,p_details jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select private.save_site(p_id,p_expected_version,p_details) $$;
create function public.save_contract_version(p_contract_id uuid,p_site_id uuid,p_version_id uuid,p_expected_revision integer,p_details jsonb,p_filename text,p_pdf_base64 text) returns jsonb
 language sql security invoker set search_path='' as $$ select private.save_contract_version(p_contract_id,p_site_id,p_version_id,p_expected_revision,p_details,p_filename,p_pdf_base64) $$;
create function public.publish_contract(p_contract_id uuid,p_expected_revision integer,p_version_id uuid) returns jsonb
 language sql security invoker set search_path='' as $$ select private.publish_contract(p_contract_id,p_expected_revision,p_version_id) $$;
create function public.download_contract_file(p_version_id uuid) returns table(filename text,pdf_base64 text,sha256 text)
 language sql stable security invoker set search_path='' as $$
 select v.filename,encode(f.pdf,'base64'),v.sha256 from private.contract_files f join public.contract_versions v on v.id=f.version_id where f.version_id=p_version_id
$$;

revoke all on function private.save_site(uuid,integer,jsonb) from public,anon,service_role;
grant execute on function private.save_site(uuid,integer,jsonb) to authenticated;

revoke all on function public.save_site(uuid,integer,jsonb) from public,anon,service_role;
grant execute on function public.save_site(uuid,integer,jsonb) to authenticated;

revoke all on function private.save_contract_version(uuid,uuid,uuid,integer,jsonb,text,text) from public,anon,service_role;
grant execute on function private.save_contract_version(uuid,uuid,uuid,integer,jsonb,text,text) to authenticated;

revoke all on function public.save_contract_version(uuid,uuid,uuid,integer,jsonb,text,text) from public,anon,service_role;
grant execute on function public.save_contract_version(uuid,uuid,uuid,integer,jsonb,text,text) to authenticated;

revoke all on function private.publish_contract(uuid,integer,uuid) from public,anon,service_role;
grant execute on function private.publish_contract(uuid,integer,uuid) to authenticated;

revoke all on function public.publish_contract(uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.publish_contract(uuid,integer,uuid) to authenticated;

revoke all on function public.download_contract_file(uuid) from public,anon,service_role;
grant execute on function public.download_contract_file(uuid) to authenticated;

create trigger maintenance_write_gate before insert or update or delete or truncate on public.facility_managers for each statement execute function private.enforce_maintenance();

create trigger maintenance_write_gate before insert or update or delete or truncate on public.contracts for each statement execute function private.enforce_maintenance();

create trigger maintenance_write_gate before insert or update or delete or truncate on public.contract_versions for each statement execute function private.enforce_maintenance();

create trigger maintenance_write_gate before insert or update or delete or truncate on public.contract_events for each statement execute function private.enforce_maintenance();

create trigger maintenance_write_gate before insert or update or delete or truncate on private.contract_files for each statement execute function private.enforce_maintenance();

create function public.contract_summaries(p_site_id uuid)
returns table(id uuid,site_id uuid,revision integer,published_version_id uuid,created_at timestamptz,title text,contract_number text)
language sql stable security invoker set search_path='' as $$
 select c.id,c.site_id,c.revision,c.published_version_id,c.created_at,v.details->>'title',v.details->>'number'
 from public.contracts c cross join lateral (
 select details from public.contract_versions v where v.contract_id=c.id order by version desc limit 1
 ) v where c.site_id=p_site_id
$$;
revoke all on function public.contract_summaries(uuid) from public,anon;
grant execute on function public.contract_summaries(uuid) to authenticated;
create index contracts_created_by_idx on public.contracts(created_by);
create index contract_versions_created_by_idx on public.contract_versions(created_by);
create index contract_events_actor_idx on public.contract_events(actor_id);
create index contract_events_version_idx on public.contract_events(contract_id,version_id);
