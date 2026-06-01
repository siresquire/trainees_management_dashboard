-- Fix practitioner leaderboard ranking.
--
-- Previous ranking: ORDER BY avg_kc_score DESC
-- Problem: someone with 2 KCs at 100% outranked someone with 90 KCs at 98%.
--
-- New ranking for practitioner cohorts:
--   Primary   — kcs_completed × avg_kc_score  (total weighted KC points)
--   Secondary — labs_completed
--   Tertiary  — full_name (alpha tie-break)
--
-- Associate cohorts are unchanged (ranked by labs_completed only).

CREATE OR REPLACE FUNCTION get_cohort_leaderboard(p_cohort_id uuid)
RETURNS TABLE (
  trainee_id      uuid,
  full_name       text,
  kcs_completed   bigint,
  avg_kc_score    numeric,
  labs_completed  bigint,
  total_lab_tasks bigint,
  rank            bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    is_super_admin()
    OR has_cohort_access(p_cohort_id)
    OR EXISTS (SELECT 1 FROM cohorts c WHERE c.id = p_cohort_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM trainees t WHERE t.cohort_id = p_cohort_id AND t.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH cohort_info AS (
    SELECT level FROM cohorts WHERE id = p_cohort_id
  ),
  totals AS (
    SELECT COUNT(*) FILTER (WHERE task_type = 'lab') AS total_labs
    FROM   cohort_week_tasks
    WHERE  cohort_id = p_cohort_id
  ),
  scores AS (
    SELECT
      t.id                                                                           AS trainee_id,
      t.full_name,
      COUNT(c.id)  FILTER (WHERE cwt.task_type = 'kc'  AND c.score > 0)            AS kcs_completed,
      ROUND(AVG(c.score) FILTER (WHERE cwt.task_type = 'kc' AND c.score > 0), 1)   AS avg_kc_score,
      COUNT(c.id)  FILTER (WHERE cwt.task_type = 'lab')                             AS labs_completed
    FROM   trainees t
    LEFT JOIN cohort_week_tasks cwt ON cwt.cohort_id = t.cohort_id
    LEFT JOIN completions       c   ON c.trainee_id  = t.id AND c.task_id = cwt.id
    WHERE  t.cohort_id = p_cohort_id
      AND  t.status    = 'active'
    GROUP  BY t.id, t.full_name
  )
  SELECT
    s.trainee_id,
    s.full_name,
    s.kcs_completed,
    s.avg_kc_score,
    s.labs_completed,
    (SELECT total_labs FROM totals)::bigint AS total_lab_tasks,
    RANK() OVER (
      ORDER BY
        CASE (SELECT level FROM cohort_info)
          -- Associate: ranked by labs only
          WHEN 'associate' THEN s.labs_completed::numeric
          -- Practitioner / DevOps: weighted KC points (quantity × quality),
          -- labs as secondary tiebreaker
          ELSE s.kcs_completed * COALESCE(s.avg_kc_score, 0)
        END DESC,
        s.labs_completed DESC,
        s.kcs_completed  DESC
    ) AS rank
  FROM scores s
  ORDER BY rank, s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_leaderboard(uuid) TO authenticated, service_role;
