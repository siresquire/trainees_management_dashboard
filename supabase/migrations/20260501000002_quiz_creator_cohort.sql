-- =============================================================
-- Phase 7b: Quiz Creator & Cohort Extensions
-- =============================================================

-- ── 1. Extend cohort_level enum ───────────────────────────────────────────────
ALTER TYPE cohort_level ADD VALUE IF NOT EXISTS 'general';

-- ── 2. Extend cohort_platform enum ───────────────────────────────────────────
ALTER TYPE cohort_platform ADD VALUE IF NOT EXISTS 'general';

-- ── 3. cohorts: institution ───────────────────────────────────────────────────
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS institution TEXT;

-- ── 4. cohorts: end_date ─────────────────────────────────────────────────────
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS end_date DATE;
