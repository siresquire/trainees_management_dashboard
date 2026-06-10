-- ── At-risk trainee detection ────────────────────────────────────────────────
--
-- A trainee is "at risk" when, measured against what should be done BY THE
-- COHORT'S CURRENT WEEK (derived from start_date), any of these hold:
--   • labs done   < 50% of lab tasks assigned in weeks 0..current_week
--   • KCs  done   < 50% of KC  tasks assigned in weeks 0..current_week
--   • attendance  < 50% of sessions held so far
--
-- Used by the trainer overview (At-risk column) and the weekly Slack report.
-- Returns one row per at-risk trainee with the underlying numbers so the
-- report can show exactly why they were flagged.

CREATE OR REPLACE FUNCTION get_admin_at_risk(p_cohort_ids uuid[])
RETURNS TABLE (
  cohort_id      uuid,
  trainee_id     uuid,
  full_name      text,
  personal_email text,
  current_week   integer,
  labs_done      bigint,
  labs_expected  bigint,
  kcs_done       bigint,
  kcs_expected   bigint,
  att_done       bigint,
  att_total      bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH cw AS (
    SELECT id AS cohort_id,
           LEAST(
             GREATEST(1, CEIL((CURRENT_DATE - start_date + 1) / 7.0)::int),
             training_weeks
           ) AS wk
    FROM cohorts
    WHERE id = ANY(p_cohort_ids)
  ),
  vt AS (
    SELECT t.id, t.cohort_id, t.full_name, t.personal_email
    FROM trainees t
    WHERE t.cohort_id  = ANY(p_cohort_ids)
      AND t.status     = 'active'
      AND t.deleted_at IS NULL
  ),
  expected AS (
    SELECT cwt.cohort_id,
      COUNT(*) FILTER (WHERE cwt.task_type = 'lab') AS labs_expected,
      COUNT(*) FILTER (WHERE cwt.task_type = 'kc')  AS kcs_expected
    FROM cohort_week_tasks cwt
    JOIN cw ON cw.cohort_id = cwt.cohort_id
    WHERE cwt.week_number <= cw.wk
    GROUP BY cwt.cohort_id
  ),
  done AS (
    SELECT c.trainee_id,
      COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'lab' AND (c.score IS NULL OR c.score = 1)) AS labs_done,
      COUNT(DISTINCT c.task_id) FILTER (WHERE t.task_type = 'kc'  AND c.score > 0)                      AS kcs_done
    FROM completions c
    JOIN cohort_week_tasks t ON t.id = c.task_id
    JOIN cw ON cw.cohort_id = t.cohort_id
    WHERE t.week_number <= cw.wk
    GROUP BY c.trainee_id
  ),
  sess AS (
    SELECT cohort_id, COUNT(*) AS total
    FROM sessions
    WHERE cohort_id = ANY(p_cohort_ids)
    GROUP BY cohort_id
  ),
  att AS (
    SELECT x.trainee_id, COUNT(DISTINCT x.session_id) AS att_done
    FROM (
      SELECT a.trainee_id, a.session_id
      FROM attendance a
      JOIN sessions s ON s.id = a.session_id
      WHERE s.cohort_id = ANY(p_cohort_ids) AND a.status = 'present'
      UNION
      SELECT ao.trainee_id, ao.session_id
      FROM attendance_overrides ao
      JOIN sessions s ON s.id = ao.session_id
      WHERE s.cohort_id = ANY(p_cohort_ids)
    ) x
    GROUP BY x.trainee_id
  )
  SELECT
    vt.cohort_id,
    vt.id                       AS trainee_id,
    vt.full_name,
    vt.personal_email,
    cw.wk                       AS current_week,
    COALESCE(d.labs_done, 0)    AS labs_done,
    COALESCE(e.labs_expected, 0) AS labs_expected,
    COALESCE(d.kcs_done, 0)     AS kcs_done,
    COALESCE(e.kcs_expected, 0) AS kcs_expected,
    COALESCE(a.att_done, 0)     AS att_done,
    COALESCE(s.total, 0)        AS att_total
  FROM vt
  JOIN cw        ON cw.cohort_id = vt.cohort_id
  LEFT JOIN expected e ON e.cohort_id  = vt.cohort_id
  LEFT JOIN done d     ON d.trainee_id = vt.id
  LEFT JOIN sess s     ON s.cohort_id  = vt.cohort_id
  LEFT JOIN att a      ON a.trainee_id = vt.id
  WHERE
       (COALESCE(e.labs_expected, 0) > 0 AND COALESCE(d.labs_done, 0) < 0.5 * e.labs_expected)
    OR (COALESCE(e.kcs_expected, 0)  > 0 AND COALESCE(d.kcs_done, 0)  < 0.5 * e.kcs_expected)
    OR (COALESCE(s.total, 0)         > 0 AND COALESCE(a.att_done, 0)  < 0.5 * s.total)
  ORDER BY vt.cohort_id, vt.full_name;
$$;

GRANT EXECUTE ON FUNCTION get_admin_at_risk(uuid[]) TO authenticated, service_role;
