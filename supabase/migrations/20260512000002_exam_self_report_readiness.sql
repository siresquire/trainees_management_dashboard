-- 1. Trainees can self-report exam results
alter table exam_outcomes
  add column if not exists self_reported boolean not null default false;

-- 2. Trainer controls when readiness banner is visible to each trainee
alter table trainees
  add column if not exists show_readiness boolean not null default false;

-- 3. Allow trainees to INSERT their own exam outcomes (self-report)
create policy "exam_outcomes: trainee self-report"
  on exam_outcomes for insert to authenticated
  with check (
    exists (
      select 1 from trainees t
      where t.id = trainee_id
        and t.user_id = auth.uid()
        and t.status = 'active'
        and t.deleted_at is null
    )
  );

-- 4. Allow trainees to DELETE their own self-reported outcomes (in case of error)
create policy "exam_outcomes: trainee delete own self-reported"
  on exam_outcomes for delete to authenticated
  using (
    self_reported = true
    and exists (
      select 1 from trainees t
      where t.id = trainee_id
        and t.user_id = auth.uid()
    )
  );
