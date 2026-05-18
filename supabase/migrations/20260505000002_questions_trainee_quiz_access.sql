-- Allow trainees to read questions that belong to a quiz assignment
-- assigned to their cohort. This enables the quiz-taking flow.
create policy "questions: trainee reads via cohort assignment" on questions
  for select to authenticated
  using (
    exists (
      select 1
      from quiz_assignments qa
      join trainees t on t.cohort_id = qa.cohort_id
      where qa.bank_id = bank_id
        and t.user_id = auth.uid()
        and t.status = 'active'
    )
  );
