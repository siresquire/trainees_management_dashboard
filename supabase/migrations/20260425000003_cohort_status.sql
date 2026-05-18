-- ============================================================
-- Cohort status system
-- ============================================================

-- 1. New enum
create type cohort_status as enum ('active', 'completed', 'archived', 'deleted');

-- 2. Add status column, migrate from is_archived, drop old column
alter table cohorts add column status cohort_status not null default 'active';
update cohorts set status = 'archived' where is_archived = true;
alter table cohorts drop column is_archived;

-- 3. Helper: is current user an owner of this cohort (or super admin)?
create or replace function is_cohort_owner(p_cohort_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_super_admin()
    or exists (
      select 1 from cohort_access
      where cohort_id = p_cohort_id
        and trainer_id = auth.uid()
        and role = 'owner'
    )
$$;

-- 4. Update SELECT policy: trainers/QC cannot see deleted cohorts
drop policy if exists "cohorts: trainer reads own and shared" on cohorts;
create policy "cohorts: trainer reads own and shared" on cohorts
  for select using (
    is_super_admin()
    or (
      (created_by = auth.uid() or has_cohort_access(id))
      and status <> 'deleted'
    )
  );

-- 5. Update UPDATE policy: allow any cohort owner (not just created_by)
drop policy if exists "cohorts: owner or super_admin updates" on cohorts;
create policy "cohorts: owner or super_admin updates" on cohorts
  for update using (is_cohort_owner(id));

-- 6. Archive/unarchive trigger: toggle trainee account active state
create or replace function handle_cohort_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update profiles set is_active = false
    where id in (
      select user_id from trainees
      where cohort_id = new.id and user_id is not null
    );
  elsif old.status = 'archived' and new.status <> 'archived' then
    update profiles set is_active = true
    where id in (
      select user_id from trainees
      where cohort_id = new.id and user_id is not null
    );
  end if;
  return new;
end;
$$;

create trigger on_cohort_status_changed
  after update of status on cohorts
  for each row execute function handle_cohort_archive();
