-- Add last_seen presence tracking to profiles
alter table profiles add column if not exists last_seen timestamptz;

-- Allow trainers to read profiles of trainees in their cohorts (for online status)
drop policy if exists "profiles: users read own" on profiles;

create policy "profiles: users read own" on profiles
  for select using (
    id = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from trainees t
      join cohort_access ca on ca.cohort_id = t.cohort_id
      where t.user_id = profiles.id
        and ca.trainer_id = auth.uid()
    )
  );
