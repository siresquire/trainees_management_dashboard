-- Returns lab/kc task totals and session totals per cohort.
-- SECURITY DEFINER bypasses the PostgREST max-rows cap that silently
-- truncates direct SELECT queries when row counts exceed the server limit.
CREATE OR REPLACE FUNCTION get_admin_cohort_stats(p_cohort_ids uuid[])
RETURNS TABLE (
  cohort_id     uuid,
  lab_total     bigint,
  kc_total      bigint,
  session_total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.cohort_id,
    COUNT(*) FILTER (WHERE t.task_type = 'lab') AS lab_total,
    COUNT(*) FILTER (WHERE t.task_type = 'kc')  AS kc_total,
    0::bigint                                    AS session_total
  FROM cohort_week_tasks t
  WHERE t.cohort_id = ANY(p_cohort_ids)
  GROUP BY t.cohort_id

  UNION ALL

  SELECT
    s.cohort_id,
    0::bigint AS lab_total,
    0::bigint AS kc_total,
    COUNT(*)  AS session_total
  FROM sessions s
  WHERE s.cohort_id = ANY(p_cohort_ids)
  GROUP BY s.cohort_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_cohort_stats(uuid[]) TO authenticated, service_role;
