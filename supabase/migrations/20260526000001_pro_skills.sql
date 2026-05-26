-- 1a. Add pro_skills_instructor to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pro_skills_instructor';

-- 1b. Add pro_skills to cohort_access_role enum
ALTER TYPE cohort_access_role ADD VALUE IF NOT EXISTS 'pro_skills';

-- 1c. Pro skills sessions
CREATE TABLE IF NOT EXISTS pro_skills_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id     UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  session_date  DATE NOT NULL,
  topic         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1d. Pro skills attendance (per trainee per session)
CREATE TABLE IF NOT EXISTS pro_skills_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES pro_skills_sessions(id) ON DELETE CASCADE,
  trainee_id  UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present','absent','late')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, trainee_id)
);

-- 1e. Pro skills assignments
CREATE TABLE IF NOT EXISTS pro_skills_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id     UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  description   TEXT,
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1f. Pro skills submissions (done/not done checkmark)
CREATE TABLE IF NOT EXISTS pro_skills_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pro_skills_assignments(id) ON DELETE CASCADE,
  trainee_id    UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  completed     BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, trainee_id)
);

-- 1g. Enable RLS
ALTER TABLE pro_skills_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_skills_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_skills_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_skills_submissions ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user has pro_skills access to a cohort
CREATE OR REPLACE FUNCTION has_pro_skills_access(p_cohort_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM cohort_access
    WHERE cohort_id = p_cohort_id
      AND trainer_id = auth.uid()
      AND role = 'pro_skills'
  )
$$;

-- RLS: pro_skills_sessions
CREATE POLICY "pss: instructor sees own cohort sessions" ON pro_skills_sessions
  FOR SELECT USING (
    instructor_id = auth.uid()
    OR is_super_admin()
    OR has_cohort_access(cohort_id)
    OR has_pro_skills_access(cohort_id)
  );
CREATE POLICY "pss: instructor inserts" ON pro_skills_sessions
  FOR INSERT WITH CHECK (
    instructor_id = auth.uid()
    AND has_pro_skills_access(cohort_id)
  );
CREATE POLICY "pss: instructor deletes own" ON pro_skills_sessions
  FOR DELETE USING (instructor_id = auth.uid() OR is_super_admin());

-- RLS: pro_skills_attendance
CREATE POLICY "psa: instructor sees own sessions" ON pro_skills_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pro_skills_sessions s
      WHERE s.id = session_id
        AND (s.instructor_id = auth.uid() OR is_super_admin() OR has_cohort_access(s.cohort_id))
    )
    OR EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.id = trainee_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY "psa: instructor upserts" ON pro_skills_attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pro_skills_sessions s
      WHERE s.id = session_id AND s.instructor_id = auth.uid()
    )
  );
CREATE POLICY "psa: instructor updates" ON pro_skills_attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pro_skills_sessions s
      WHERE s.id = session_id AND s.instructor_id = auth.uid()
    )
  );

-- RLS: pro_skills_assignments
CREATE POLICY "psas: instructor sees" ON pro_skills_assignments
  FOR SELECT USING (
    instructor_id = auth.uid()
    OR is_super_admin()
    OR has_cohort_access(cohort_id)
    OR has_pro_skills_access(cohort_id)
    OR EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.cohort_id = pro_skills_assignments.cohort_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY "psas: instructor inserts" ON pro_skills_assignments
  FOR INSERT WITH CHECK (
    instructor_id = auth.uid()
    AND has_pro_skills_access(cohort_id)
  );
CREATE POLICY "psas: instructor deletes own" ON pro_skills_assignments
  FOR DELETE USING (instructor_id = auth.uid() OR is_super_admin());

-- RLS: pro_skills_submissions
CREATE POLICY "psub: instructor sees" ON pro_skills_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pro_skills_assignments a
      WHERE a.id = assignment_id
        AND (a.instructor_id = auth.uid() OR is_super_admin() OR has_cohort_access(a.cohort_id))
    )
    OR EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.id = trainee_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY "psub: instructor upserts" ON pro_skills_submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pro_skills_assignments a
      WHERE a.id = assignment_id AND a.instructor_id = auth.uid()
    )
  );
CREATE POLICY "psub: instructor updates" ON pro_skills_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pro_skills_assignments a
      WHERE a.id = assignment_id AND a.instructor_id = auth.uid()
    )
  );

-- Grant table access to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON pro_skills_sessions    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON pro_skills_attendance  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON pro_skills_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON pro_skills_submissions TO authenticated, service_role;
