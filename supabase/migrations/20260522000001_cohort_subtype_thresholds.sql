-- ── 1. Cohort subtype: university | external (for practitioner cohorts) ──────
ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS cohort_subtype text
    CHECK (cohort_subtype IN ('university', 'external'));

-- ── 2. Minutes-based attendance thresholds (replaces percentage logic) ────────
ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS present_threshold_mins integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS partial_threshold_mins integer NOT NULL DEFAULT 25;

-- ── 3. Admin settings: default attendance thresholds per practitioner subtype ─
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS practitioner_university_threshold_mins integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS practitioner_external_threshold_mins   integer NOT NULL DEFAULT 60;

-- ── 4. Ensure grants cover new columns ───────────────────────────────────────
GRANT SELECT, UPDATE ON admin_settings TO authenticated;
GRANT SELECT, UPDATE ON admin_settings TO service_role;
GRANT SELECT, UPDATE ON cohorts        TO service_role;
