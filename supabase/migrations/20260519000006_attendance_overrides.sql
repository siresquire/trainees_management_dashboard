CREATE TABLE IF NOT EXISTS attendance_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  trainee_id uuid NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  overridden_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, trainee_id)
);
ALTER TABLE attendance_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trainers_manage_overrides" ON attendance_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM sessions s JOIN cohort_access ca ON ca.cohort_id = s.cohort_id WHERE s.id = session_id AND ca.trainer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
