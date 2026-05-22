-- KCs with score = 0 were being counted as "completed" because the canvas sync
-- stores any non-null score. Excel tracker (and trainer intent) only counts a KC
-- as done when score > 0. All four completion functions are patched here.
--
-- DROP + CREATE is required for functions where the return type column list
-- changes; for the others, CREATE OR REPLACE is sufficient since only the body
-- changes (the signature stays the same).

-- 1. get_cohort_completion_summary (trainer trainees page)
--    signature unchanged → CREATE OR REPLACE
CREATE OR REPLACE FUNCTION get_cohort_completion_summary(p_cohort_id uuid)
RETURNS TABLE (
  trainee_id  uuid,
  lab_count   bigint,
  kc_count    bigint,
  video_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM cohorts WHERE id = p_cohort_id AND created_by = auth.uid())
    OR has_cohort_access(p_cohort_id)
  ) THEN
    RAISE EXCEPTION 'Access denied to cohort %', p_cohort_id;
  END IF;

  RETURN QUERY
  SELECT
    comp.trainee_id,
    COUNT(CASE WHEN cwt.task_type = 'lab'   AND (comp.score IS NULL OR comp.score = 1)
               THEN 1 END)::bigint AS lab_count,
    COUNT(CASE WHEN cwt.task_type = 'kc'    AND comp.score > 0 THEN 1 END)::bigint AS kc_count,
    COUNT(CASE WHEN cwt.task_type = 'video' THEN 1 END)::bigint AS video_count
  FROM   completions       comp
  JOIN   cohort_week_tasks cwt  ON cwt.id = comp.task_id
  WHERE  cwt.cohort_id = p_cohort_id
  GROUP  BY comp.trainee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_completion_summary(uuid) TO authenticated, service_role;

-- 2. get_cohort_completion_by_week (trainer week-filter)
--    signature unchanged → CREATE OR REPLACE
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
    COUNT(*) FILTER (WHERE t.task_type = 'lab' AND (c.score IS NULL OR c.score = 1)) AS lab_count,
    COUNT(*) FILTER (WHERE t.task_type = 'kc'  AND c.score > 0)                      AS kc_count
  FROM completions c
  JOIN cohort_week_tasks t ON t.id = c.task_id
  WHERE t.cohort_id = p_cohort_id
  GROUP BY c.trainee_id, t.week_number
  ORDER BY c.trainee_id, t.week_number;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_completion_by_week(uuid) TO authenticated, service_role;

-- 3. get_admin_completion_summary (admin dashboard)
--    signature unchanged → CREATE OR REPLACE
CREATE OR REPLACE FUNCTION get_admin_completion_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id uuid,
  cohort_id  uuid,
  lab_count  bigint,
  kc_count   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.trainee_id,
    t.cohort_id,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'lab' AND (c.score IS NULL OR c.score = 1)) AS lab_count,
    COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'kc'  AND c.score > 0)                      AS kc_count
  FROM completions c
  JOIN cohort_week_tasks t ON t.id = c.task_id
  WHERE t.cohort_id = ANY(p_cohort_ids)
  GROUP BY c.trainee_id, t.cohort_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_completion_summary(uuid[]) TO authenticated, service_role;

-- 4. get_cohort_leaderboard (trainee detail page rank + analytics)
--    kcs_completed and avg_kc_score both incorrectly included 0-score rows.
CREATE OR REPLACE FUNCTION get_cohort_leaderboard(p_cohort_id uuid)
RETURNS TABLE (
  trainee_id     uuid,
  full_name      text,
  kcs_completed  bigint,
  avg_kc_score   numeric,
  labs_completed bigint,
  total_lab_tasks bigint,
  rank           bigint
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
  WITH totals AS (
    SELECT COUNT(*) FILTER (WHERE task_type = 'lab') AS total_labs
    FROM   cohort_week_tasks
    WHERE  cohort_id = p_cohort_id
  ),
  scores AS (
    SELECT
      t.id                                                                                       AS trainee_id,
      t.full_name,
      COUNT(c.id)  FILTER (WHERE cwt.task_type = 'kc'  AND c.score > 0)                        AS kcs_completed,
      ROUND(AVG(c.score) FILTER (WHERE cwt.task_type = 'kc' AND c.score > 0), 1)               AS avg_kc_score,
      COUNT(c.id)  FILTER (WHERE cwt.task_type = 'lab')                                        AS labs_completed
    FROM   trainees t
    LEFT JOIN cohort_week_tasks cwt ON cwt.cohort_id = t.cohort_id
    LEFT JOIN completions c ON c.trainee_id = t.id AND c.task_id = cwt.id
    WHERE  t.cohort_id = p_cohort_id
      AND  t.status = 'active'
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
      ORDER BY COALESCE(s.avg_kc_score, 0) DESC, s.labs_completed DESC
    ) AS rank
  FROM scores s
  ORDER BY rank, s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_leaderboard(uuid) TO authenticated;
