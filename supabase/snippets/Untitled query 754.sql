-- Add voucher_code to existing vouchers table
alter table vouchers
  add column if not exists voucher_code text;

-- Create voucher_pool table for pre-uploaded codes
create table if not exists voucher_pool (
  id           uuid        primary key default gen_random_uuid(),
  cohort_id    uuid        not null references cohorts(id) on delete cascade,
  trainee_id   uuid        references trainees(id) on delete set null,
  email        text        not null,
  name         text,
  voucher_code text        not null,
  is_used      boolean     not null default false,
  uploaded_by  uuid        references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_voucher_pool_cohort_id  on voucher_pool(cohort_id);
create index if not exists idx_voucher_pool_trainee_id on voucher_pool(trainee_id);
create index if not exists idx_voucher_pool_used       on voucher_pool(cohort_id, is_used);

alter table voucher_pool enable row level security;

create policy "voucher_pool: staff full access"
  on voucher_pool for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('trainer', 'quiz_creator', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('trainer', 'quiz_creator', 'super_admin')
    )
  );