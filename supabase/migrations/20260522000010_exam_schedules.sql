-- Exam scheduling workflow:
-- Trainees with graduated=true fill a registration form; data lands in exam_schedules.
-- Trainers and admin assign batch numbers; admin marks voucher_issued.
-- passing_score per level stored in admin_settings (default 700, AWS CCP minimum).

-- ── 1. exam_schedules table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_schedules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id        uuid        NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  cohort_id         uuid        NOT NULL REFERENCES cohorts(id)  ON DELETE CASCADE,

  -- Editable personal details (pre-filled from trainee but overridable)
  first_name        text        NOT NULL,
  last_name         text        NOT NULL,
  other_names       text,
  personal_email    text        NOT NULL,

  -- Cohort display name at submission time (cohorts.name, e.g. "Jan-26_Uni_Aminu")
  cohort_display_name text      NOT NULL,

  -- Location
  region            text        NOT NULL,

  -- AWS account details
  aws_account_id    text,
  aws_cert_email    text,

  -- Canvas graduation status (always "Graduated" for now, stored for record)
  canvas_grad_status text       NOT NULL DEFAULT 'Graduated',

  -- Admin / trainer managed fields
  batch_number      integer,
  voucher_issued    boolean     NOT NULL DEFAULT false,
  voucher_issued_at timestamptz,
  voucher_issued_by uuid        REFERENCES profiles(id),

  -- Timestamps
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (trainee_id)
);

CREATE INDEX IF NOT EXISTS exam_schedules_cohort_id_idx    ON exam_schedules(cohort_id);
CREATE INDEX IF NOT EXISTS exam_schedules_batch_number_idx ON exam_schedules(batch_number);
CREATE INDEX IF NOT EXISTS exam_schedules_voucher_idx       ON exam_schedules(voucher_issued);

-- ── 2. Add exam_passing_score to admin_settings ───────────────────────────────
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS exam_passing_score integer NOT NULL DEFAULT 700;

-- ── 3. RLS for exam_schedules ─────────────────────────────────────────────────
ALTER TABLE exam_schedules ENABLE ROW LEVEL SECURITY;

-- Trainee: read and upsert their own row
CREATE POLICY "exam_schedules: trainee reads own" ON exam_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.id = exam_schedules.trainee_id
        AND t.user_id = auth.uid()
        AND t.deleted_at IS NULL
    )
  );

CREATE POLICY "exam_schedules: trainee upserts own" ON exam_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.id = exam_schedules.trainee_id
        AND t.user_id = auth.uid()
        AND t.deleted_at IS NULL
    )
  );

-- Trainer: read schedules for cohorts they own
CREATE POLICY "exam_schedules: trainer reads cohort" ON exam_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cohort_access ca
      WHERE ca.cohort_id = exam_schedules.cohort_id
        AND ca.trainer_id = auth.uid()
    )
  );

-- Trainer: update batch_number only (via service role check in action)
-- We allow trainers to UPDATE through service role actions, not direct RLS.

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON exam_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_schedules TO service_role;
