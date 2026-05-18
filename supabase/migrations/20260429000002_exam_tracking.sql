-- ── Exam Tracking Enhancements ───────────────────────────────────────────────
-- 1. Extends exam_type enum with SAP-C02 / DOP-C02
-- 2. Extends exam_quizzes with focus_type, focus_label, max_score
-- 3. Adds attempt_no to exam_outcomes
-- 4. Enables RLS + policies on exam tables

-- ── 1. Extend exam_type enum ──────────────────────────────────────────────────
alter type exam_type add value if not exists 'SAP-C02';
alter type exam_type add value if not exists 'DOP-C02';

-- ── 2. exam_quizzes: focus + max_score ───────────────────────────────────────
alter table exam_quizzes
  add column if not exists focus_type  text    not null default 'practitioner'
    check (focus_type in ('practitioner', 'associate', 'professional', 'other')),
  add column if not exists focus_label text,          -- custom text when focus_type = 'other'
  add column if not exists max_score   numeric not null default 100;

-- ── 3. exam_outcomes: attempt tracking ───────────────────────────────────────
alter table exam_outcomes
  add column if not exists attempt_no integer not null default 1;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
alter table exam_quizzes  enable row level security;
alter table exam_scores   enable row level security;
alter table exam_outcomes enable row level security;
alter table vouchers      enable row level security;

-- exam_quizzes: trainers/QC/SA can manage; trainees can read their cohort's quizzes
drop policy if exists "exam_quizzes_all" on exam_quizzes;
create policy "exam_quizzes_all" on exam_quizzes
  for all to authenticated
  using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or exists (
      select 1 from trainees t
      where t.cohort_id = exam_quizzes.cohort_id and t.user_id = auth.uid()
    )
  )
  with check (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

-- exam_scores: trainers can manage; trainees can read own scores
drop policy if exists "exam_scores_all" on exam_scores;
create policy "exam_scores_all" on exam_scores
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from exam_quizzes eq
      where eq.id = quiz_id
        and (
          has_cohort_access(eq.cohort_id)
          or exists (select 1 from cohorts c where c.id = eq.cohort_id and c.created_by = auth.uid())
        )
    )
    or exists (
      select 1 from trainees t
      where t.id = exam_scores.trainee_id and t.user_id = auth.uid()
    )
  )
  with check (
    is_super_admin()
    or exists (
      select 1 from exam_quizzes eq
      where eq.id = quiz_id
        and (
          has_cohort_access(eq.cohort_id)
          or exists (select 1 from cohorts c where c.id = eq.cohort_id and c.created_by = auth.uid())
        )
    )
  );

-- vouchers: trainers can manage; trainees can read own vouchers
drop policy if exists "vouchers_all" on vouchers;
create policy "vouchers_all" on vouchers
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      where t.id = trainee_id
        and (
          has_cohort_access(t.cohort_id)
          or exists (select 1 from cohorts c where c.id = t.cohort_id and c.created_by = auth.uid())
          or t.user_id = auth.uid()
        )
    )
  )
  with check (
    is_super_admin()
    or exists (
      select 1 from trainees t
      where t.id = trainee_id
        and (
          has_cohort_access(t.cohort_id)
          or exists (select 1 from cohorts c where c.id = t.cohort_id and c.created_by = auth.uid())
        )
    )
  );

-- exam_outcomes: trainers can manage; trainees can read own outcomes
drop policy if exists "exam_outcomes_all" on exam_outcomes;
create policy "exam_outcomes_all" on exam_outcomes
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      where t.id = trainee_id
        and (
          has_cohort_access(t.cohort_id)
          or exists (select 1 from cohorts c where c.id = t.cohort_id and c.created_by = auth.uid())
          or t.user_id = auth.uid()
        )
    )
  )
  with check (
    is_super_admin()
    or exists (
      select 1 from trainees t
      where t.id = trainee_id
        and (
          has_cohort_access(t.cohort_id)
          or exists (select 1 from cohorts c where c.id = t.cohort_id and c.created_by = auth.uid())
        )
    )
  );
