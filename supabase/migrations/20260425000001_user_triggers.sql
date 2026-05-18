-- =============================================================
-- Auto-create profile when a user is created in auth.users
-- =============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'trainee'::user_role)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================
-- Auto-link trainees.user_id when a user is created
-- =============================================================
create or replace function link_trainee_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.trainees
  set user_id = new.id
  where lower(personal_email) = lower(new.email)
    and user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_link_trainee
  after insert on auth.users
  for each row execute function link_trainee_on_signup();

-- =============================================================
-- Backfill: create profiles for users already in auth.users
-- =============================================================
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  coalesce((u.raw_user_meta_data->>'role')::user_role, 'trainee'::user_role)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- =============================================================
-- Backfill: link trainees.user_id for already-existing users
-- =============================================================
update public.trainees t
set user_id = u.id
from auth.users u
where lower(t.personal_email) = lower(u.email)
  and t.user_id is null;
