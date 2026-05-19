-- Per-cohort saved analytics pass threshold (0–100 integer, percent).
-- NULL means use the application default (80%).
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS analytics_threshold integer;
