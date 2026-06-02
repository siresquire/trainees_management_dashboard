-- Add visit tracking columns to trainees
ALTER TABLE trainees
  ADD COLUMN IF NOT EXISTS visit_count          integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dashboard_visit timestamptz;

-- Atomic increment function — called from the trainee's own session
CREATE OR REPLACE FUNCTION record_trainee_visit()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE trainees
  SET
    visit_count          = COALESCE(visit_count, 0) + 1,
    last_dashboard_visit = now()
  WHERE user_id    = auth.uid()
    AND status     = 'active'
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION record_trainee_visit() TO authenticated;
