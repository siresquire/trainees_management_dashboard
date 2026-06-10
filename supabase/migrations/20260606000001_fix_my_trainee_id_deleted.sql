-- my_trainee_id() is used in RLS policies for completions, attendance,
-- quiz_attempts, etc. Without the deleted_at filter it returns the
-- soft-deleted trainee record when a trainee is in two cohorts, causing
-- every gated table to return 0 rows for the active cohort.
CREATE OR REPLACE FUNCTION my_trainee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM trainees
  WHERE user_id    = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1
$$;
