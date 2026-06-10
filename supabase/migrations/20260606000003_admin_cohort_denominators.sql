-- ── Per-cohort denominators for the trainer/admin overview ──────────────────
--
-- The overview page previously fetched ALL cohort_week_tasks rows across all
-- active cohorts to count tasks per cohort. With 13+ cohorts that exceeds
-- PostgREST's ~1000-row cap and silently truncates, so cohorts whose task
-- rows fell past the cap got labsTotal = 0 and rendered as 0% / "—" even
-- though their completions were correctly counted (e.g. GHACC69 had 2,175
-- labs done but no lab-task denominator).
--
-- This returns exactly ONE row per cohort — it can never hit the cap.

CREATE OR REPLACE FUNCTION get_admin_cohort_denominators(p_cohort_ids uuid[])
RETURNS TABLE (
  cohort_id     uuid,
  lab_tasks     bigint,
  kc_tasks      bigint,
  video_tasks   bigint,
  session_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ids.id                        AS cohort_id,
    COALESCE(t.lab_tasks, 0)      AS lab_tasks,
    COALESCE(t.kc_tasks, 0)       AS kc_tasks,
    COALESCE(t.video_tasks, 0)    AS video_tasks,
    COALESCE(s.n, 0)              AS session_count
  FROM unnest(p_cohort_ids) AS ids(id)
  LEFT JOIN (
    SELECT cohort_id,
      COUNT(*) FILTER (WHERE task_type = 'lab')   AS lab_tasks,
      COUNT(*) FILTER (WHERE task_type = 'kc')    AS kc_tasks,
      COUNT(*) FILTER (WHERE task_type = 'video') AS video_tasks
    FROM cohort_week_tasks
    WHERE cohort_id = ANY(p_cohort_ids)
    GROUP BY cohort_id
  ) t ON t.cohort_id = ids.id
  LEFT JOIN (
    SELECT cohort_id, COUNT(*) AS n
    FROM sessions
    WHERE cohort_id = ANY(p_cohort_ids)
    GROUP BY cohort_id
  ) s ON s.cohort_id = ids.id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_cohort_denominators(uuid[]) TO authenticated, service_role;
