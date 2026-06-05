-- Store CSV participants who could not be matched to a cohort trainee.
-- Allows trainers to see which emails appeared in the Zoom/Teams CSV
-- but didn't match any registered trainee email.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS unmatched_participants JSONB NOT NULL DEFAULT '[]'::jsonb;
