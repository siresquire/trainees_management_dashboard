-- Replace per-week aggregation with per-trainee totals to stay under PostgREST's
-- max-rows cap. The old version returned one row per (trainee × week), producing
-- ~6 000 rows for 11 cohorts — silently truncated at ~1 000 rows and leaving
-- most trainees with labsDone=0 on the admin dashboard.
-- This version returns ONE row per (trainee, cohort), capped at ~500 rows total.
CREATE OR REPLACE FUNCTION get_admin_completion_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id  uuid,
  cohort_id   uuid,
  lab_count   bigint,
  kc_count    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.trainee_id,
    t.cohort_id,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'lab') AS lab_count,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'kc')  AS kc_count
  FROM completions c
  JOIN cohort_week_tasks t ON t.id = c.task_id
  WHERE t.cohort_id = ANY(p_cohort_ids)
  GROUP BY c.trainee_id, t.cohort_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_completion_summary(uuid[]) TO authenticated, service_role;

-- Same fix for attendance summary — old version returned one row per
-- (trainee × week), which also hit the row cap when many cohorts are active.
CREATE OR REPLACE FUNCTION get_admin_attendance_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id     uuid,
  cohort_id      uuid,
  attended_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH attended AS (
    SELECT a.trainee_id, s.id AS session_id, s.cohort_id
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND a.status IN ('present', 'partial')
      AND a.trainee_id IS NOT NULL

    UNION

    SELECT ao.trainee_id, s.id AS session_id, s.cohort_id
    FROM attendance_overrides ao
    JOIN sessions s ON s.id = ao.session_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND ao.trainee_id IS NOT NULL
  )
  SELECT trainee_id, cohort_id, COUNT(*) AS attended_count
  FROM attended
  GROUP BY trainee_id, cohort_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_attendance_summary(uuid[]) TO authenticated, service_role;
