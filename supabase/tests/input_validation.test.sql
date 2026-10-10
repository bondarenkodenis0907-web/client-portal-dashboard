begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users(id, email, raw_user_meta_data) values
('99999999-9999-4999-8999-999999999999', 'input-client@example.test', '{}'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'input-engineer@example.test', '{}');
insert into public.service_staff(user_id, display_name) values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Input Test Engineer');
insert into public.service_requests(id, user_id, site, system, description) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'Office', 'CCTV', 'Camera offline'),
('abababab-abab-4aba-8aba-abababababab', '99999999-9999-4999-8999-999999999999', 'Office', 'Access control', 'Reader offline');

-- These writes use the same authenticated role as the Data API, bypassing UI validation.
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';

select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', '', 'CCTV', 'Camera offline')$$,
  '23514', null, 'A client cannot submit an empty site');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', E' \t\n\r\f ', 'CCTV', 'Camera offline')$$,
  '23514', null, 'A client cannot submit a whitespace-only site');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', U&'\00A0\FEFF', 'CCTV', 'Camera offline')$$,
  '23514', null, 'NBSP and FEFF cannot satisfy the site requirement');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', repeat('x', 121), 'CCTV', 'Camera offline')$$,
  '23514', null, 'A client cannot submit a site longer than 120 characters');

select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', '', 'Camera offline')$$,
  '23514', null, 'A client cannot submit an empty system');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', E' \t\n\r\f ', 'Camera offline')$$,
  '23514', null, 'A client cannot submit a whitespace-only system');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', U&'\00A0\FEFF', 'Camera offline')$$,
  '23514', null, 'NBSP and FEFF cannot satisfy the system requirement');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', repeat('x', 121), 'Camera offline')$$,
  '23514', null, 'A client cannot submit a system longer than 120 characters');

select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', 'CCTV', '')$$,
  '23514', null, 'A client cannot submit an empty description');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', 'CCTV', E' \t\n\r\f ')$$,
  '23514', null, 'A client cannot submit a whitespace-only description');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', 'CCTV', U&'\00A0\FEFF')$$,
  '23514', null, 'NBSP and FEFF cannot satisfy the description requirement');
select throws_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'Office', 'CCTV', repeat('x', 5001))$$,
  '23514', null, 'A client cannot submit a description longer than 5000 characters');

select lives_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', repeat('x', 120), repeat('x', 120), repeat('x', 5000))$$,
  'Request fields accept their maximum valid lengths');
select lives_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', 'A', 'B', 'C')$$,
  'A one-character meaningful value is valid in required request fields');
select lives_ok($$insert into public.service_requests(user_id, site, system, description)
  values ('99999999-9999-4999-8999-999999999999', repeat('Ж', 120), 'Видеонаблюдение', 'Проверить камеру')$$,
  'Request limits count characters rather than UTF-8 bytes');

select lives_ok($$update public.profiles
  set full_name = repeat('x', 120), company = repeat('x', 120), job_title = repeat('x', 120)
  where id = '99999999-9999-4999-8999-999999999999'$$,
  'Optional profile fields accept 120 characters');
select throws_ok($$update public.profiles set full_name = repeat('x', 121)
  where id = '99999999-9999-4999-8999-999999999999'$$,
  '23514', null, 'Direct profile updates reject an overlong full name');
select throws_ok($$update public.profiles set company = repeat('x', 121)
  where id = '99999999-9999-4999-8999-999999999999'$$,
  '23514', null, 'Direct profile updates reject an overlong company');
select throws_ok($$update public.profiles set job_title = repeat('x', 121)
  where id = '99999999-9999-4999-8999-999999999999'$$,
  '23514', null, 'Direct profile updates reject an overlong job title');
select lives_ok($$update public.profiles set full_name = null, company = null, job_title = null
  where id = '99999999-9999-4999-8999-999999999999'$$,
  'Optional profile fields can be cleared to null');
select ok((select full_name is null and company is null and job_title is null
  from public.profiles where id = '99999999-9999-4999-8999-999999999999'),
  'Cleared profile fields remain null');
select lives_ok($$update public.profiles set full_name = '', company = '', job_title = ''
  where id = '99999999-9999-4999-8999-999999999999'$$,
  'The length limit does not make optional profile fields required');

set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select lives_ok($$update public.service_requests
  set status = 'in_progress', assigned_to = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  'Valid request assignment and work start still succeed');
select throws_ok($$update public.service_requests set status = 'closed', resolution = ''
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Closure rejects an empty resolution');
select throws_ok($$update public.service_requests set status = 'closed', resolution = repeat(' ', 12)
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Closure rejects a spaces-only resolution');
select throws_ok($$update public.service_requests set status = 'closed', resolution = repeat(E'\t\n', 6)
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Tabs and newlines cannot satisfy the resolution requirement');
select throws_ok($$update public.service_requests set status = 'closed', resolution = repeat(U&'\00A0\FEFF', 6)
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'NBSP and FEFF cannot satisfy the resolution requirement');
select throws_ok($$update public.service_requests set status = 'closed', resolution = '123456789'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'The existing ten-character resolution minimum remains enforced');
select throws_ok($$update public.service_requests
  set status = 'closed', resolution = U&'\FEFF' || E'\t123456789\n' || U&'\00A0'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Boundary whitespace cannot pad a nine-character resolution to ten');
select throws_ok($$update public.service_requests set status = 'closed', resolution = repeat('x', 5001)
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Direct closure rejects a resolution longer than 5000 characters');
select ok((select status = 'in_progress' and resolution is null and closed_at is null
  from public.service_requests where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'Rejected closures leave the request in progress without a resolution or closure time');
select lives_ok($$update public.service_requests set status = 'closed', resolution = repeat('x', 5000)
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  'A 5000-character meaningful resolution can close the request');
select is((select char_length(resolution) from public.service_requests
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 5000,
  'The valid resolution is stored without truncation');
select ok((select closed_at is not null from public.service_requests
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'Valid closure still records a closure timestamp');
select is((select count(*)::integer from public.request_events
  where request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 3,
  'Rejected closures add no events; valid creation, start and closure each add one');
select is((select char_length(resolution) from public.request_events
  where request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and status = 'closed'), 5000,
  'The closure event preserves the complete valid resolution');
select throws_ok($$update public.service_requests set resolution = 'Another valid resolution'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  '23514', null, 'Input validation preserves the rule that closed requests cannot be changed');
select lives_ok($$update public.service_requests
  set status = 'in_progress', assigned_to = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  where id = 'abababab-abab-4aba-8aba-abababababab'$$,
  'The request for the minimum resolution boundary can be started');
select lives_ok($$update public.service_requests set status = 'closed', resolution = '1234567890'
  where id = 'abababab-abab-4aba-8aba-abababababab'$$,
  'Exactly ten meaningful resolution characters can close a request');
select is((select char_length(resolution) from public.service_requests
  where id = 'abababab-abab-4aba-8aba-abababababab'), 10,
  'The minimum valid resolution is stored unchanged');

set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
select is((select char_length(resolution) from public.service_requests
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 5000,
  'The client can read the completed work after validated closure');

reset role;
select * from finish();
rollback;
