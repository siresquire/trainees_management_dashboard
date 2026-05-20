-- Add admin role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- Trainer marks trainee as cleared to sit the official exam
ALTER TABLE trainees ADD COLUMN IF NOT EXISTS exam_approved boolean NOT NULL DEFAULT false;

GRANT UPDATE (exam_approved) ON trainees TO authenticated;
GRANT UPDATE (exam_approved) ON trainees TO service_role;
