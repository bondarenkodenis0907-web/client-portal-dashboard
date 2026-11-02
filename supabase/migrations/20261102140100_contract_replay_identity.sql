-- Exact replay acknowledges the immutable saved snapshot without resolving mutable staff names.
-- Current manager admission is still required; any admitted manager may acknowledge an exact replay.
create or replace function private.save_contract_version(p_contract_id uuid,p_site_id uuid,p_version_id uuid,p_expected_revision integer,p_details jsonb,p_filename text,p_pdf_base64 text) returns jsonb
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
   if v.contract_id=p_contract_id and (v.details - array['responsible_name','author_name'])=d and v.filename=p_filename and v.sha256=h then return jsonb_build_object('id',c.id,'version_id',v.id,'revision',c.revision); end if;
   raise sqlstate 'PT409' using message='Operation already used with different details';
  end if;
  if c.revision<>p_expected_revision then raise sqlstate 'PT409' using message='Contract changed; reload saved details'; end if;

 else
  if p_expected_revision<>0 then raise sqlstate 'PT404' using message='Contract unavailable'; end if;
  if not exists(select 1 from public.sites where id=p_site_id and not is_archived) then raise invalid_parameter_value using message='Active site required'; end if;
  insert into public.contracts(id,site_id,created_by) values(p_contract_id,p_site_id,auth.uid()) returning * into c;
 end if;
 select display_name into staff_name from public.service_staff where user_id=(d->>'responsible_id')::uuid and is_active;
 if not found then raise invalid_parameter_value using message='Active responsible staff required'; end if;
 d=jsonb_set(d,'{responsible_name}',to_jsonb(staff_name));
 d=jsonb_set(d,'{author_name}',to_jsonb((select display_name from public.service_staff where user_id=auth.uid())));
 if c.revision=p_expected_revision then
  update public.contracts set revision=revision+1 where id=c.id returning * into c;
 end if;
 select coalesce(max(version),0)+1 into n from public.contract_versions where contract_id=c.id;
 insert into public.contract_versions(id,contract_id,version,details,filename,byte_size,sha256,created_by) values(p_version_id,c.id,n,d,p_filename,octet_length(bytes),h,auth.uid());
 insert into private.contract_files(version_id,pdf) values(p_version_id,bytes);
 insert into public.contract_events(contract_id,version_id,actor_id,event_type,revision) values(c.id,p_version_id,auth.uid(),'version_added',c.revision);
 return jsonb_build_object('id',c.id,'version_id',p_version_id,'revision',c.revision);
end $$;

