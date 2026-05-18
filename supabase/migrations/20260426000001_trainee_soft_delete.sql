-- Extend trainee_status with 'disabled' variant
alter type trainee_status add value if not exists 'disabled';

-- Soft-delete support: non-null means the row is logically deleted
alter table trainees add column if not exists deleted_at timestamptz;
