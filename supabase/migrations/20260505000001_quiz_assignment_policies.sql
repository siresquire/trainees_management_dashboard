-- =============================================================
-- Phase 7b: Quiz Assignment Flow — policy hardening + grants
-- =============================================================

-- ── 1. Tighten quiz_assignments INSERT to trainer/quiz_creator/super_admin ─────
--      The original "for all using" policy allows any authenticated user to
--      insert (including trainees). Replace with explicit check.
drop policy if exists "quiz_assignments: trainer manages" on quiz_assignments;

create policy "quiz_assignments: creator manages" on quiz_assignments
  for all to authenticated
  using (is_super_admin() or created_by = auth.uid())
  with check (
    (is_super_admin() or auth_role() in ('trainer', 'quiz_creator'))
    and created_by = auth.uid()
  );

-- ── 2. Allow quiz_creator to read cohorts they are assigned to ─────────────────
--      quiz_creator users get cohort_access rows just like trainers.
--      The existing cohorts select policy already calls has_cohort_access()
--      which checks cohort_access, so no change needed there.

-- ── 3. Allow trainees to read quiz_assignments for their cohort ────────────────
--      The existing policy already covers this. No change needed.

-- ── 4. Ensure grants exist for quiz engine tables ─────────────────────────────
grant select, insert, update, delete on quiz_assignments to authenticated;
grant select, insert, update, delete on quiz_attempts    to authenticated;
grant select, insert, update, delete on quiz_answers     to authenticated;
grant select, insert                 on quiz_violations  to authenticated;
grant select                         on question_banks   to authenticated;
grant select                         on questions        to authenticated;
