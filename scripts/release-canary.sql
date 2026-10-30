\set ON_ERROR_STOP on
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
set local idle_in_transaction_session_timeout = '15s';
do $$ begin
  if (select enabled from private.maintenance_state where singleton for update) is distinct from true then
    raise exception 'Canary requires an already closed maintenance gate';
  end if;
end $$;
update private.maintenance_state set enabled=false where singleton;
-- CANARY_WRITE_PROBES
select set_config('portal.canary_staff', :'canary_staff', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', :'canary_client', true);
select id as canary_request from public.create_service_request(
  :'canary_operation'::uuid,'Release canary','CCTV','Controlled release verification','medium') \gset
select set_config('portal.canary_request', :'canary_request', true);
select count(*)=1 as replay_ok from public.create_service_request(
  :'canary_operation'::uuid,'Release canary','CCTV','Controlled release verification','medium')
where id=:'canary_request'::uuid and version=1 \gset
\if :replay_ok
\else
  \quit 3
\endif
select set_config('request.jwt.claim.sub', :'canary_staff', true);
select count(*)=1 as progress_ok from public.process_service_request(
  :'canary_request'::uuid,1,:'canary_staff'::uuid,'in_progress',null) where version=2 \gset
\if :progress_ok
\else
  \quit 3
\endif
do $$ begin
  begin
    perform public.process_service_request(current_setting('portal.canary_request')::uuid,
      1,current_setting('portal.canary_staff')::uuid,'closed','Controlled canary completed');
    raise exception 'Stale processing must fail';
  exception when sqlstate 'PT409' then null;
  end;
end $$;
select count(*)=1 as closed_ok from public.process_service_request(
  :'canary_request'::uuid,2,:'canary_staff'::uuid,'closed','Controlled canary completed') where version=3 \gset
\if :closed_ok
\else
  \quit 3
\endif
select set_config('request.jwt.claim.sub', :'canary_client', true);
select count(*)=3 as history_ok from public.request_events where request_id=:'canary_request'::uuid \gset
\if :history_ok
\else
  \quit 3
\endif
select set_config('request.jwt.claim.sub', :'canary_outsider', true);
select count(*)=0 as private_ok from public.service_requests where id=:'canary_request'::uuid \gset
\if :private_ok
\else
  \quit 3
\endif
reset role;
update private.maintenance_state set enabled=true where singleton;
do $$ begin
  if (select enabled from private.maintenance_state where singleton) is distinct from true then
    raise exception 'Canary must finish with the gate closed';
  end if;
end $$;
commit;
