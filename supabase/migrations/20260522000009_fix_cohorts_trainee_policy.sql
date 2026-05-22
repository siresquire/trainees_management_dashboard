-- The previous migration (000008) created infinite recursion:
-- cohorts policy → queries trainees → trainees policies → query cohorts → ...
-- PostgreSQL detects this and errors on ALL queries touching cohorts or trainees.
-- Fix: drop the bad policy, then use a SECURITY DEFINER function that bypasses
-- RLS when checking trainee membership, breaking the cycle.

DROP POLICY IF EXISTS "cohorts: trainee reads own cohort" ON cohorts;

-- SECURITY DEFINER runs as the function owner (bypasses RLS on trainees),
-- so the trainees query inside never triggers the cohorts policy again.
-- auth.uid() is evaluated in the caller's session context, so it is still
-- correctly scoped to the current user.
CREATE OR REPLACE FUNCTION is_cohort_member(p_cohort_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainees t
    WHERE t.cohort_id = p_cohort_id
      AND t.user_id   = auth.uid()
      AND t.deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION is_cohort_member(uuid) TO authenticated;

CREATE POLICY "cohorts: trainee reads own cohort" ON cohorts
  FOR SELECT USING (
    is_cohort_member(id)
  );
