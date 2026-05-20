-- ── 1. Voucher deadline + revocation on admin_voucher_pool ──────────────────
ALTER TABLE admin_voucher_pool
  ADD COLUMN IF NOT EXISTS deadline    timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ── 2. Voucher deadline + revocation on vouchers (trainer-issued) ────────────
ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS deadline    date,
  ADD COLUMN IF NOT EXISTS revoked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ── 3. Exam appointments ─────────────────────────────────────────────────────
-- Trainee declares date/time/place for their official exam before the code
-- becomes visible to them. Visible to their trainer and to admins.
CREATE TABLE IF NOT EXISTS exam_appointments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id   uuid        NOT NULL REFERENCES trainees(id)  ON DELETE CASCADE,
  voucher_id   uuid                 REFERENCES vouchers(id)  ON DELETE SET NULL,
  cohort_id    uuid        NOT NULL REFERENCES cohorts(id)   ON DELETE CASCADE,
  exam_date    date        NOT NULL,
  exam_time    time        NOT NULL,
  exam_location text       NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_appointments_trainee_idx ON exam_appointments(trainee_id);
CREATE INDEX IF NOT EXISTS exam_appointments_cohort_idx  ON exam_appointments(cohort_id);

-- ── 4. Admin settings (per-level thresholds) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  level                     text    NOT NULL UNIQUE CHECK (level IN ('practitioner','associate')),
  data_bundle_threshold_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (data_bundle_threshold_pct BETWEEN 0 AND 100),
  stipend_threshold_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (stipend_threshold_pct     BETWEEN 0 AND 100),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL
);

-- Seed default rows so the admin never needs to INSERT
INSERT INTO admin_settings (level, data_bundle_threshold_pct, stipend_threshold_pct)
VALUES ('practitioner', 0, 0), ('associate', 0, 0)
ON CONFLICT (level) DO NOTHING;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

-- exam_appointments: trainees see/manage their own; staff see cohort they own; admins/SA see all
ALTER TABLE exam_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainee own appointments" ON exam_appointments
  FOR ALL USING (
    trainee_id IN (
      SELECT id FROM trainees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "trainer cohort appointments" ON exam_appointments
  FOR SELECT USING (
    cohort_id IN (
      SELECT cohort_id FROM cohort_access WHERE trainer_id = auth.uid()
    )
  );

CREATE POLICY "admin all appointments" ON exam_appointments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin')
    )
  );

-- admin_settings: admins and super_admin can read and write; service role has full access
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read settings" ON admin_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin')
    )
  );

CREATE POLICY "admin write settings" ON admin_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin')
    )
  );

-- ── 6. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_appointments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_appointments TO service_role;
GRANT SELECT, UPDATE ON admin_settings TO authenticated;
GRANT SELECT, UPDATE ON admin_settings TO service_role;
