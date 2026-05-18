-- Track whether a quiz assignment has been published to the Exam dashboard
alter table quiz_assignments
  add column if not exists published_exam_quiz_id uuid references exam_quizzes(id) on delete set null;

create index if not exists idx_quiz_assignments_cohort_id on quiz_assignments(cohort_id);
