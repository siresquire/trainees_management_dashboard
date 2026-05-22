-- Trainees need to read their own cohort row to display the countdown banner,
-- eligibility section, and cohort metadata on the trainee dashboard.
-- Previously the cohorts RLS only allowed trainer/admin access.
CREATE POLICY "cohorts: trainee reads own cohort" ON cohorts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainees t
      WHERE t.cohort_id = id
        AND t.user_id = auth.uid()
    )
  );
