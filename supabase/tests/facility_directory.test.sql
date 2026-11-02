begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users(id,email) values
 ('12000000-0000-4000-8000-000000000001','facility-a@example.test'),
 ('12000000-0000-4000-8000-000000000002','facility-b@example.test'),
 ('12000000-0000-4000-8000-000000000003','facility-staff@example.test');
insert into public.service_staff(user_id,display_name) values
 ('12000000-0000-4000-8000-000000000003','Facility engineer');
insert into public.sites(id,name) values
 ('12000000-0000-4000-8000-000000000011','Site A'),
 ('12000000-0000-4000-8000-000000000012','Site B');
insert into public.buildings(id,site_id,name) values
 ('12000000-0000-4000-8000-000000000021','12000000-0000-4000-8000-000000000011','Building A1'),
 ('12000000-0000-4000-8000-000000000022','12000000-0000-4000-8000-000000000011','Building A2'),
 ('12000000-0000-4000-8000-000000000023','12000000-0000-4000-8000-000000000012','Building B1');
insert into public.site_memberships(site_id,user_id) values
 ('12000000-0000-4000-8000-000000000011','12000000-0000-4000-8000-000000000001'),
 ('12000000-0000-4000-8000-000000000012','12000000-0000-4000-8000-000000000002');

select ok((select relrowsecurity from pg_class where oid='public.sites'::regclass),'Sites have RLS');
select ok((select relrowsecurity from pg_class where oid='public.buildings'::regclass),'Buildings have RLS');
select ok((select relrowsecurity from pg_class where oid='public.site_memberships'::regclass),'Admissions have RLS');
set local role anon;
select throws_ok($$select * from public.sites$$,'42501',null,'Anonymous cannot read sites');
select throws_ok($$select * from public.buildings$$,'42501',null,'Anonymous cannot read buildings');
select throws_ok($$select * from public.site_memberships$$,'42501',null,'Anonymous cannot read admissions');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000001';
select results_eq($$select name from public.sites order by name$$,$$values ('Site A'::text)$$,'A sees only explicitly assigned site');
select results_eq($$select name from public.buildings order by name$$,$$values ('Building A1'::text),('Building A2'::text)$$,'A sees only own site buildings');
select is((select count(*)::int from public.site_memberships),1,'A cannot enumerate other users admissions');
select is((select count(*)::int from public.sites where id='12000000-0000-4000-8000-000000000012'),0,'Direct foreign site UUID hidden');
select is((select count(*)::int from public.buildings where id='12000000-0000-4000-8000-000000000023'),0,'Direct foreign building UUID hidden');
select throws_ok($$insert into public.site_memberships(site_id,user_id) values ('12000000-0000-4000-8000-000000000012','12000000-0000-4000-8000-000000000001')$$,'42501',null,'Self-enrolment forbidden');
select throws_ok($$update public.site_memberships set is_active=true$$,'42501',null,'Client cannot change admissions');
select throws_ok($$delete from public.sites$$,'42501',null,'Client cannot delete sites');
select throws_ok($$insert into public.buildings(site_id,name) values ('12000000-0000-4000-8000-000000000011','Injected')$$,'42501',null,'Client cannot create buildings');
select throws_ok($$update public.sites set name='Injected'$$,'42501',null,'Client cannot rename own site');
reset role;
update public.site_memberships set is_active=false where user_id='12000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.sites),0,'Revocation takes effect with unchanged JWT claims');
select is((select count(*)::int from public.buildings),0,'Revocation also hides buildings');
reset role;
update auth.users set raw_user_meta_data='{"role":"staff","site_id":"12000000-0000-4000-8000-000000000012"}' where id='12000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.sites),0,'Editable metadata does not grant access');
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.sites),2,'Active staff read company sites');
select is((select count(*)::int from public.buildings),3,'Active staff read company buildings');
select is((select count(*)::int from public.site_memberships),2,'Active staff read admission directory');
select throws_ok($$insert into public.sites(name) values ('Staff injection')$$,'42501',null,'Queue staff are not provisioning administrators');
reset role;
update public.service_staff set is_active=false where user_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.sites),0,'Inactive staff lose site directory access');
select is((select count(*)::int from public.buildings),0,'Inactive staff lose building directory access');
set local request.jwt.claim.sub='12000000-0000-4000-8000-000000000002';
select results_eq($$select name from public.sites$$,$$values ('Site B'::text)$$,'Client B retains separate admission');
select results_eq($$select name from public.buildings$$,$$values ('Building B1'::text)$$,'B cannot read A buildings');
reset role;
select throws_ok($$insert into public.buildings(site_id,name) values ('12000000-0000-4000-8000-000000000099','Missing')$$,'23503',null,'Building requires existing site');
select throws_ok($$insert into public.site_memberships(site_id,user_id) values ('12000000-0000-4000-8000-000000000099','12000000-0000-4000-8000-000000000002')$$,'23503',null,'Admission requires existing site');
select throws_ok($$insert into public.site_memberships(site_id,user_id) values ('12000000-0000-4000-8000-000000000011','12000000-0000-4000-8000-000000000099')$$,'23503',null,'Admission requires existing user');
select throws_ok($$insert into public.sites(name) values ('  ')$$,'23514',null,'Blank site name rejected');
select throws_ok($$insert into public.buildings(site_id,name) values ('12000000-0000-4000-8000-000000000011','  ')$$,'23514',null,'Blank building name rejected');
select throws_ok($$insert into public.sites(name,address) values ('Name',repeat('x',301))$$,'23514',null,'Oversized address rejected');
select throws_ok($$delete from public.sites where id='12000000-0000-4000-8000-000000000011'$$,'23503',null,'Deleting parent cannot cascade buildings or admission');
update private.maintenance_state set enabled=true where singleton;
set local role service_role;
select throws_ok($$update public.sites set name=name where false$$,'PT503',null,'Gate blocks privileged site update');
select throws_ok($$insert into public.buildings(site_id,name) values ('12000000-0000-4000-8000-000000000011','During maintenance')$$,'PT503',null,'Gate blocks privileged building insert');
select throws_ok($$delete from public.site_memberships where false$$,'PT503',null,'Gate blocks privileged admission deletion');
reset role;
select throws_ok($$truncate public.buildings$$,'PT503',null,'Gate also blocks building truncate');
update private.maintenance_state set enabled=false where singleton;
set local role service_role;
select lives_ok($$update public.sites set address='Restored service address' where id='12000000-0000-4000-8000-000000000011'$$,'Administrative writes resume after gate opens');
reset role;
select is((select count(*)::int from public.buildings),3,'Rejected writes preserve buildings');
select is((select count(*)::int from public.site_memberships),2,'Rejected writes preserve admissions');
select * from finish();
rollback;
