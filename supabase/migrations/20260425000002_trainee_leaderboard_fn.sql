-- Leaderboard RPC — returns aggregate scores per active trainee in a cohort.
-- SECURITY DEFINER lets it read completions for all trainees; access gated below.
create or replace function get_cohort_leaderboard(p_cohort_id uuid)
returns table (
  trainee_id    uuid,
  full_name     text,
  kcs_completed bigint,
  avg_kc_score  numeric,
  labs_completed bigint,
  rank          bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_super_admin()
    or has_cohort_access(p_cohort_id)
    or exists (select 1 from cohorts c where c.id = p_cohort_id and c.created_by = auth.uid())
    or exists (select 1 from trainees t where t.cohort_id = p_cohort_id and t.user_id = auth.uid())
  ) then
    raise exception 'access denied';
  end if;

  return query
  with scores as (
    select
      t.id                                                                          as trainee_id,
      t.full_name,
      count(c.id) filter (where cwt.task_type = 'kc')                              as kcs_completed,
      round(avg(c.score) filter (where cwt.task_type = 'kc'), 1)                   as avg_kc_score,
      count(c.id) filter (where cwt.task_type = 'lab')                             as labs_completed
    from trainees t
    left join cohort_week_tasks cwt on cwt.cohort_id = t.cohort_id
    left join completions c on c.trainee_id = t.id and c.task_id = cwt.id
    where t.cohort_id = p_cohort_id
      and t.status = 'active'
    group by t.id, t.full_name
  )
  select
    s.trainee_id,
    s.full_name,
    s.kcs_completed,
    s.avg_kc_score,
    s.labs_completed,
    rank() over (
      order by coalesce(s.avg_kc_score, 0) desc, s.labs_completed desc
    ) as rank
  from scores s
  order by rank, s.full_name;
end;
$$;

grant execute on function get_cohort_leaderboard(uuid) to authenticated;
