-- Per-trainee, per-cohort, per-week lab/KC completion counts across multiple cohorts.
-- Uses COUNT DISTINCT on task_id so duplicate completion rows don't inflate numbers.
-- SECURITY DEFINER bypasses RLS and the PostgREST max-rows cap.
CREATE OR REPLACE FUNCTION get_admin_completion_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id  uuid,
  cohort_id   uuid,
  week_number integer,
  lab_count   bigint,
  kc_count    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.trainee_id,
    t.cohort_id,
    t.week_number,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'lab') AS lab_count,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'kc')  AS kc_count
  FROM completions c
  JOIN cohort_week_tasks t ON t.id = c.task_id
  WHERE t.cohort_id = ANY(p_cohort_ids)
  GROUP BY c.trainee_id, t.cohort_id, t.week_number
  ORDER BY c.trainee_id, t.cohort_id, t.week_number;
$$;

GRANT EXECUTE ON FUNCTION get_admin_completion_summary(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_completion_summary(uuid[]) TO service_role;

-- Per-trainee, per-cohort, per-week attendance counts across multiple cohorts.
-- Unions attendance (present/partial) with attendance_overrides (excused) so
-- excused absences count as attended — UNION deduplicates same session+trainee.
CREATE OR REPLACE FUNCTION get_admin_attendance_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id     uuid,
  cohort_id      uuid,
  week_number    integer,
  attended_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH attended AS (
    SELECT a.trainee_id, s.id AS session_id, s.cohort_id, s.week_number
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND a.status IN ('present', 'partial')
      AND a.trainee_id IS NOT NULL

    UNION

    SELECT ao.trainee_id, s.id AS session_id, s.cohort_id, s.week_number
    FROM attendance_overrides ao
    JOIN sessions s ON s.id = ao.session_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND ao.trainee_id IS NOT NULL
  )
  SELECT trainee_id, cohort_id, week_number, COUNT(*) AS attended_count
  FROM attended
  GROUP BY trainee_id, cohort_id, week_number
  ORDER BY trainee_id, cohort_id, week_number;
$$;

GRANT EXECUTE ON FUNCTION get_admin_attendance_summary(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_attendance_summary(uuid[]) TO service_role;
