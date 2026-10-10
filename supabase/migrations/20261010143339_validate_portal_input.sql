-- Apply only after checking existing rows against these limits. Validated
-- constraints protect Data API writes as well as writes from the application.
-- The whitespace class matches JavaScript String.trim(), including NBSP/FEFF.
alter table public.service_requests
  add constraint service_requests_site_input_check
    check (
      char_length(site) <= 120
      and site ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    ),
  add constraint service_requests_system_input_check
    check (
      char_length(system) <= 120
      and system ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    ),
  add constraint service_requests_description_input_check
    check (
      char_length(description) <= 5000
      and description ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    ),
  add constraint service_requests_resolution_input_check
    check (
      resolution is null
      or (
        char_length(resolution) <= 5000
        and char_length(regexp_replace(
          resolution,
          U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
          '',
          'g'
        )) >= 10
      )
    );

-- Profile fields remain optional; only their maximum size is restricted.
alter table public.profiles
  add constraint profiles_full_name_length_check
    check (char_length(full_name) <= 120),
  add constraint profiles_company_length_check
    check (char_length(company) <= 120),
  add constraint profiles_job_title_length_check
    check (char_length(job_title) <= 120);
