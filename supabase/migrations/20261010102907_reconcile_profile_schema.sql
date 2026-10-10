
-- Keep profile records consistent with Auth users.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
      and confdeltype = 'c'
  ) then
    alter table public.profiles
      drop constraint if exists profiles_id_fkey;

    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id)
      references auth.users(id)
      on delete cascade;
  end if;
end;
$$;

-- Creating a profile should be safe if it already exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user()
from public, anon, authenticated;
