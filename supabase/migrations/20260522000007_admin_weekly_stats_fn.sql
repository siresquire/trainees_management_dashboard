-- RPC to fetch per-trainee lab/KC/attendance counts for a specific set of weeks.
-- Used by the Admin Dashboard week-filter and for pre-computing wk 1-6 stipend data.
-- Returns one row per active/completed trainee in the given cohorts (0 for any missing).
-- Row count: at most total_trainees (~400) — safely under the PostgREST ~1 000-row cap.

CREATE OR REPLACE FUNCTION get_admin_weekly_stats(
  p_cohort_ids   uuid[],
  p_week_numbers int[]
)
RETURNS TABLE (
  trainee_id     uuid,
  lab_count      bigint,
  kc_count       bigint,
  attended_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH comp AS (
    SELECT c.trainee_id,
      COUNT(*) FILTER (WHERE cwt.task_type = 'lab' AND (c.score IS NULL OR c.score = 1)) AS lab_count,
      COUNT(*) FILTER (WHERE cwt.task_type = 'kc'  AND c.score > 0)                      AS kc_count
    FROM completions c
    JOIN cohort_week_tasks cwt ON cwt.id = c.task_id
    WHERE cwt.cohort_id    = ANY(p_cohort_ids)
      AND cwt.week_number  = ANY(p_week_numbers)
    GROUP BY c.trainee_id
  ),
  att AS (
    SELECT a.trainee_id,
      COUNT(*) FILTER (WHERE a.status IN ('present', 'partial')) AS attended_count
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE s.cohort_id   = ANY(p_cohort_ids)
      AND s.week_number = ANY(p_week_numbers)
    GROUP BY a.trainee_id
  )
  SELECT
    t.id                              AS trainee_id,
    COALESCE(comp.lab_count,     0)   AS lab_count,
    COALESCE(comp.kc_count,      0)   AS kc_count,
    COALESCE(att.attended_count, 0)   AS attended_count
  FROM trainees t
  LEFT JOIN comp ON comp.trainee_id = t.id
  LEFT JOIN att  ON att.trainee_id  = t.id
  WHERE t.cohort_id  = ANY(p_cohort_ids)
    AND t.status     IN ('active', 'completed')
    AND t.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION get_admin_weekly_stats(uuid[], int[]) TO authenticated, service_role;
