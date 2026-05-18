-- Aggregates per-trainee attendance counts for a cohort.
-- Returns one row per trainee (active, non-deleted) with:
--   sessions_attended  = sessions where their status was 'present' or 'partial'
--   total_sessions     = all recorded sessions for that cohort
create or replace function get_cohort_attendance_summary(p_cohort_id uuid)
returns table(
  trainee_id        uuid,
  sessions_attended integer,
  total_sessions    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as trainee_id,
    (
      select count(*)::integer
      from   sessions  s
      join   attendance a on a.session_id = s.id
      where  s.cohort_id  = p_cohort_id
        and  a.trainee_id = t.id
        and  a.status in ('present', 'partial')
    ) as sessions_attended,
    (
      select count(*)::integer
      from   sessions s
      where  s.cohort_id = p_cohort_id
    ) as total_sessions
  from trainees t
  where t.cohort_id = p_cohort_id
    and t.deleted_at is null;
$$;

grant execute on function get_cohort_attendance_summary(uuid) to authenticated;
