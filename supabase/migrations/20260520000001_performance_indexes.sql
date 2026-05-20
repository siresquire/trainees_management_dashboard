-- ── Trainees ──────────────────────────────────────────────────────────────────
-- Fast lookup of active trainees per cohort (admin dashboard, trainee list)
CREATE INDEX IF NOT EXISTS idx_trainees_cohort_active
  ON trainees(cohort_id)
  WHERE deleted_at IS NULL;

-- Partial index limited to commonly-queried statuses
CREATE INDEX IF NOT EXISTS idx_trainees_cohort_status
  ON trainees(cohort_id, status)
  WHERE deleted_at IS NULL;

-- ── Completions ───────────────────────────────────────────────────────────────
-- Core join: which tasks has each trainee completed?
CREATE INDEX IF NOT EXISTS idx_completions_trainee_task
  ON completions(trainee_id, task_id);

-- Reverse direction: all completions for a task (used in bulk counts)
CREATE INDEX IF NOT EXISTS idx_completions_task_trainee
  ON completions(task_id, trainee_id);

-- ── Cohort week tasks ─────────────────────────────────────────────────────────
-- Filter tasks by cohort and type (lab/kc totals)
CREATE INDEX IF NOT EXISTS idx_cwt_cohort_type
  ON cohort_week_tasks(cohort_id, task_type);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_cohort
  ON sessions(cohort_id);

-- For ordering by start time (attendance page, trainee detail)
CREATE INDEX IF NOT EXISTS idx_sessions_cohort_started
  ON sessions(cohort_id, started_at DESC);

-- ── Attendance ────────────────────────────────────────────────────────────────
-- Per-trainee attendance (trainee detail pane, admin dashboard counts)
CREATE INDEX IF NOT EXISTS idx_attendance_trainee_session
  ON attendance(trainee_id, session_id);

-- Per-session attendance (attendance page upload, threshold recalc)
CREATE INDEX IF NOT EXISTS idx_attendance_session_trainee
  ON attendance(session_id, trainee_id);

-- Partial index for present/partial rows only (attendance counts)
CREATE INDEX IF NOT EXISTS idx_attendance_present_partial
  ON attendance(trainee_id)
  WHERE status IN ('present', 'partial');

-- ── Attendance overrides ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_att_overrides_trainee_session
  ON attendance_overrides(trainee_id, session_id);

-- ── Exam scores ───────────────────────────────────────────────────────────────
-- Matrix: scores per trainee per quiz
CREATE INDEX IF NOT EXISTS idx_exam_scores_quiz_trainee
  ON exam_scores(quiz_id, trainee_id);

CREATE INDEX IF NOT EXISTS idx_exam_scores_trainee_quiz
  ON exam_scores(trainee_id, quiz_id);

-- ── Exam quizzes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_quizzes_cohort
  ON exam_quizzes(cohort_id, created_at);

-- ── Exam outcomes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_outcomes_trainee
  ON exam_outcomes(trainee_id, attempt_no);

-- ── Vouchers ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vouchers_trainee
  ON vouchers(trainee_id, attempt_no DESC);

-- ── Admin voucher pool ────────────────────────────────────────────────────────
-- Fast pool counts and unissued code selection
CREATE INDEX IF NOT EXISTS idx_admin_vp_level_used
  ON admin_voucher_pool(level, is_used, created_at)
  WHERE is_used = false;

-- ── Cohort access ─────────────────────────────────────────────────────────────
-- Find owner trainer per cohort
CREATE INDEX IF NOT EXISTS idx_cohort_access_cohort_role
  ON cohort_access(cohort_id, role);

-- Find cohorts a trainer owns (trainer dashboard)
CREATE INDEX IF NOT EXISTS idx_cohort_access_trainer_role
  ON cohort_access(trainer_id, role);

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role_active
  ON profiles(role, is_active);
