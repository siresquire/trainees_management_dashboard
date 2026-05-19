-- Per-trainee, per-week KC and Lab completion counts for a cohort.
-- Used by the week-filter UI on the main cohort dashboard.
CREATE OR REPLACE FUNCTION get_cohort_completion_by_week(p_cohort_id uuid)
RETURNS TABLE (
  trainee_id  uuid,
  week_number integer,
  lab_count   bigint,
  kc_count    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.trainee_id,
    t.week_number,
    COUNT(*) FILTER (WHERE t.task_type = 'lab') AS lab_count,
    COUNT(*) FILTER (WHERE t.task_type = 'kc')  AS kc_count
  FROM completions c
  JOIN cohort_week_tasks t ON t.id = c.task_id
  WHERE t.cohort_id = p_cohort_id
  GROUP BY c.trainee_id, t.week_number
  ORDER BY c.trainee_id, t.week_number;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_completion_by_week(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cohort_completion_by_week(uuid) TO service_role;
