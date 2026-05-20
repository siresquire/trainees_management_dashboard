-- Temp password tracking on trainees
-- temp_password: plaintext stored so trainer can see/copy it from the table
-- temp_password_changed_at: set when trainee changes their own password; null = not yet changed

alter table public.trainees
  add column if not exists temp_password             text,
  add column if not exists temp_password_changed_at  timestamptz;
