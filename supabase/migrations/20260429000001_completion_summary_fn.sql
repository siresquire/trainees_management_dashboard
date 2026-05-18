-- ── get_cohort_completion_summary ────────────────────────────────────────────
-- Returns per-trainee Lab/KC/Video completion counts for a given cohort.
-- Aggregates in Postgres so the caller receives one row per trainee (not one
-- row per completion), completely avoiding the PostgREST max_rows limit that
-- would truncate results for cohorts with > 1000 completion records.
-- Access-checked: caller must own the cohort, have explicit cohort_access, or
-- be a super_admin.

create or replace function get_cohort_completion_summary(p_cohort_id uuid)
returns table (
  trainee_id  uuid,
  lab_count   bigint,
  kc_count    bigint,
  video_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorisation gate (runs under caller's uid, not definer's)
  if not (
    is_super_admin()
    or exists (select 1 from cohorts where id = p_cohort_id and created_by = auth.uid())
    or has_cohort_access(p_cohort_id)
  ) then
    raise exception 'Access denied to cohort %', p_cohort_id;
  end if;

  return query
  select
    comp.trainee_id,
    count(case when cwt.task_type = 'lab'   then 1 end)::bigint as lab_count,
    count(case when cwt.task_type = 'kc'    then 1 end)::bigint as kc_count,
    count(case when cwt.task_type = 'video' then 1 end)::bigint as video_count
  from   completions        comp
  join   cohort_week_tasks  cwt  on cwt.id = comp.task_id
  where  cwt.cohort_id = p_cohort_id
  group  by comp.trainee_id;
end;
$$;

grant execute on function get_cohort_completion_summary(uuid) to authenticated, service_role;
