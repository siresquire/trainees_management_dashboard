-- ── Fix admin summary RPCs: exclude deleted/dropped trainees ────────────────
--
-- Problem 1 (>100% metrics): get_admin_completion_summary counted completions
-- from ALL trainee records — including soft-deleted duplicates and dropped
-- trainees — while the dashboard denominator (tasks × trainees) counts only
-- active trainees. Cohorts with deleted duplicates showed 123-164%.
--
-- Problem 2 (0% for newer cohorts): the inflated result set exceeded
-- PostgREST's ~1000-row cap and silently truncated in arbitrary order,
-- dropping rows for newer cohorts (labs showed 0% while the cohort page,
-- which queries per-cohort, showed correct numbers).
--
-- Fix: join trainees and require status IN ('active','completed') AND
-- deleted_at IS NULL AND the trainee belongs to the task's cohort.
-- Also: attendance now counts only 'present' (binary policy — partial/brief
-- are treated as absent).

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
  JOIN trainees tr         ON tr.id = c.trainee_id
                          AND tr.cohort_id  = t.cohort_id
                          AND tr.status     IN ('active', 'completed')
                          AND tr.deleted_at IS NULL
  WHERE t.cohort_id = ANY(p_cohort_ids)
  GROUP BY c.trainee_id, t.cohort_id
  ORDER BY t.cohort_id, c.trainee_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_completion_summary(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION get_admin_attendance_summary(p_cohort_ids uuid[])
RETURNS TABLE (
  trainee_id     uuid,
  cohort_id      uuid,
  attended_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH valid_trainees AS (
    SELECT id, cohort_id FROM trainees
    WHERE cohort_id  = ANY(p_cohort_ids)
      AND status     IN ('active', 'completed')
      AND deleted_at IS NULL
  ),
  attended AS (
    SELECT a.trainee_id, s.id AS session_id, s.cohort_id
    FROM attendance a
    JOIN sessions s        ON s.id  = a.session_id
    JOIN valid_trainees vt ON vt.id = a.trainee_id AND vt.cohort_id = s.cohort_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND a.status = 'present'

    UNION

    SELECT ao.trainee_id, s.id AS session_id, s.cohort_id
    FROM attendance_overrides ao
    JOIN sessions s        ON s.id  = ao.session_id
    JOIN valid_trainees vt ON vt.id = ao.trainee_id AND vt.cohort_id = s.cohort_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
  )
  SELECT trainee_id, cohort_id, COUNT(*) AS attended_count
  FROM attended
  GROUP BY trainee_id, cohort_id
  ORDER BY cohort_id, trainee_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_attendance_summary(uuid[]) TO authenticated, service_role;

-- get_admin_weekly_stats already filters trainees correctly; just align the
-- attendance counting with the binary present/absent policy.
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
      COUNT(*) FILTER (WHERE a.status = 'present') AS attended_count
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

-- ── New: weekly trend aggregates for the overview line chart ────────────────
-- One row per (cohort, week): tiny result set (~cohorts × weeks ≈ 200 rows).
CREATE OR REPLACE FUNCTION get_admin_weekly_trend(p_cohort_ids uuid[])
RETURNS TABLE (
  cohort_id   uuid,
  week_number integer,
  labs_done   bigint,
  labs_total  bigint,
  kcs_done    bigint,
  kcs_total   bigint,
  att_done    bigint,
  att_total   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH valid_trainees AS (
    SELECT id, cohort_id FROM trainees
    WHERE cohort_id  = ANY(p_cohort_ids)
      AND status     IN ('active', 'completed')
      AND deleted_at IS NULL
  ),
  tcount AS (
    SELECT cohort_id, COUNT(*) AS n FROM valid_trainees GROUP BY cohort_id
  ),
  spine AS (
    SELECT DISTINCT cohort_id, week_number FROM (
      SELECT cohort_id, week_number FROM cohort_week_tasks
      WHERE cohort_id = ANY(p_cohort_ids) AND week_number IS NOT NULL
      UNION
      SELECT cohort_id, week_number FROM sessions
      WHERE cohort_id = ANY(p_cohort_ids) AND week_number IS NOT NULL
    ) u
  ),
  task_weeks AS (
    SELECT cohort_id, week_number,
      COUNT(*) FILTER (WHERE task_type = 'lab') AS lab_tasks,
      COUNT(*) FILTER (WHERE task_type = 'kc')  AS kc_tasks
    FROM cohort_week_tasks
    WHERE cohort_id = ANY(p_cohort_ids)
    GROUP BY cohort_id, week_number
  ),
  comp AS (
    SELECT t.cohort_id, t.week_number,
      COUNT(*) FILTER (WHERE t.task_type = 'lab' AND (c.score IS NULL OR c.score = 1)) AS labs_done,
      COUNT(*) FILTER (WHERE t.task_type = 'kc'  AND c.score > 0)                      AS kcs_done
    FROM completions c
    JOIN cohort_week_tasks t ON t.id = c.task_id
    JOIN valid_trainees vt   ON vt.id = c.trainee_id AND vt.cohort_id = t.cohort_id
    WHERE t.cohort_id = ANY(p_cohort_ids)
    GROUP BY t.cohort_id, t.week_number
  ),
  sess AS (
    SELECT cohort_id, week_number, COUNT(*) AS n_sessions
    FROM sessions
    WHERE cohort_id = ANY(p_cohort_ids) AND week_number IS NOT NULL
    GROUP BY cohort_id, week_number
  ),
  att AS (
    SELECT s.cohort_id, s.week_number, COUNT(*) AS att_done
    FROM attendance a
    JOIN sessions s        ON s.id  = a.session_id
    JOIN valid_trainees vt ON vt.id = a.trainee_id AND vt.cohort_id = s.cohort_id
    WHERE s.cohort_id = ANY(p_cohort_ids)
      AND s.week_number IS NOT NULL
      AND a.status = 'present'
    GROUP BY s.cohort_id, s.week_number
  )
  SELECT
    sp.cohort_id,
    sp.week_number,
    COALESCE(comp.labs_done, 0)                                AS labs_done,
    COALESCE(tw.lab_tasks, 0)   * COALESCE(tc.n, 0)            AS labs_total,
    COALESCE(comp.kcs_done, 0)                                 AS kcs_done,
    COALESCE(tw.kc_tasks, 0)    * COALESCE(tc.n, 0)            AS kcs_total,
    COALESCE(att.att_done, 0)                                  AS att_done,
    COALESCE(sess.n_sessions, 0) * COALESCE(tc.n, 0)           AS att_total
  FROM spine sp
  LEFT JOIN tcount tc    ON tc.cohort_id = sp.cohort_id
  LEFT JOIN task_weeks tw ON tw.cohort_id = sp.cohort_id AND tw.week_number = sp.week_number
  LEFT JOIN comp         ON comp.cohort_id = sp.cohort_id AND comp.week_number = sp.week_number
  LEFT JOIN sess         ON sess.cohort_id = sp.cohort_id AND sess.week_number = sp.week_number
  LEFT JOIN att          ON att.cohort_id  = sp.cohort_id AND att.week_number  = sp.week_number
  WHERE sp.week_number > 0
  ORDER BY sp.cohort_id, sp.week_number;
$$;

GRANT EXECUTE ON FUNCTION get_admin_weekly_trend(uuid[]) TO authenticated, service_role;
