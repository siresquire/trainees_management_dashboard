-- =============================================================
-- Phase 7a: Quiz Engine Foundation
-- =============================================================

-- ── 1. Extend quiz_question_type enum ────────────────────────────────────────
alter type quiz_question_type add value if not exists 'code_input';

-- ── 2. cohorts: index-number toggle ──────────────────────────────────────────
alter table cohorts
  add column if not exists has_index_numbers boolean not null default false;

-- ── 3. trainees: index / matriculation number ─────────────────────────────────
alter table trainees
  add column if not exists index_number text;

-- ── 4. quiz_attempts: strike counter + outcome flags ─────────────────────────
alter table quiz_attempts
  add column if not exists warning_count  integer not null default 0,
  add column if not exists retake_blocked boolean not null default false,
  add column if not exists terminated     boolean not null default false;

-- ── 5. quiz_assignments: optional per-question timer ─────────────────────────
--      Distinct from eye_away_warn_secs which is anti-cheat.
--      null = no per-question limit; >0 = seconds per question.
alter table quiz_assignments
  add column if not exists per_question_secs integer;

-- ── 6. webcam_snapshots ───────────────────────────────────────────────────────
create table if not exists webcam_snapshots (
  id           uuid primary key default uuid_generate_v4(),
  attempt_id   uuid not null references quiz_attempts(id) on delete cascade,
  storage_path text not null,           -- Supabase Storage object path
  captured_at  timestamptz not null default now(),
  flagged      boolean not null default false,
  flag_reason  text
);

-- ── 7. quiz_notifications ─────────────────────────────────────────────────────
--      In-app + email notification log.  One row = one event fired.
create table if not exists quiz_notifications (
  id            uuid primary key default uuid_generate_v4(),
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  attempt_id    uuid references quiz_attempts(id) on delete set null,
  type          text not null,          -- 'warning', 'lockout', 'auto_submit', 'grade_ready'
  title         text not null,
  message       text,
  is_read       boolean not null default false,
  sent_email    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists quiz_notifications_recipient_idx
  on quiz_notifications(recipient_id, is_read, created_at desc);

-- ── 8. question_bank_shares ───────────────────────────────────────────────────
create table if not exists question_bank_shares (
  id           uuid primary key default uuid_generate_v4(),
  bank_id      uuid not null references question_banks(id) on delete cascade,
  shared_with  uuid not null references auth.users(id) on delete cascade,
  shared_by    uuid not null references auth.users(id) on delete cascade,
  can_edit     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (bank_id, shared_with)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table webcam_snapshots     enable row level security;
alter table quiz_notifications   enable row level security;
alter table question_bank_shares enable row level security;

-- webcam_snapshots: assignment creator or the trainee themselves
create policy "webcam_snapshots: trainer reads, trainee own" on webcam_snapshots
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from quiz_attempts qa
      join quiz_assignments qas on qas.id = qa.assignment_id
      where qa.id = attempt_id and qas.created_by = auth.uid()
    )
    or exists (
      select 1 from quiz_attempts qa
      join trainees t on t.id = qa.trainee_id
      where qa.id = attempt_id and t.user_id = auth.uid()
    )
  );

-- quiz_notifications: recipients read/mark own; system (service role) inserts
create policy "quiz_notifications: own" on quiz_notifications
  for select to authenticated
  using (recipient_id = auth.uid() or is_super_admin());

create policy "quiz_notifications: mark read" on quiz_notifications
  for update to authenticated
  using (recipient_id = auth.uid() or is_super_admin());

create policy "quiz_notifications: service inserts" on quiz_notifications
  for insert to authenticated
  with check (is_super_admin() or recipient_id = auth.uid());

-- question_bank_shares: creator manages; shared user reads own share row
create policy "question_bank_shares: manage" on question_bank_shares
  for all to authenticated
  using (
    is_super_admin()
    or shared_by = auth.uid()
    or exists (
      select 1 from question_banks qb
      where qb.id = bank_id and qb.created_by = auth.uid()
    )
  )
  with check (
    is_super_admin()
    or shared_by = auth.uid()
    or exists (
      select 1 from question_banks qb
      where qb.id = bank_id and qb.created_by = auth.uid()
    )
  );

create policy "question_bank_shares: shared user reads" on question_bank_shares
  for select to authenticated
  using (shared_with = auth.uid() or is_super_admin());

-- ── Update question_banks policy to include shares ────────────────────────────
-- Drop the narrow read policy and replace with one that includes shares.
drop policy if exists "question_banks: trainer reads own and public" on question_banks;

create policy "question_banks: reads" on question_banks
  for select to authenticated
  using (
    is_super_admin()
    or created_by = auth.uid()
    or is_public = true
    or exists (
      select 1 from question_bank_shares s
      where s.bank_id = id and s.shared_with = auth.uid()
    )
  );

-- ── Update questions policy to include shares ─────────────────────────────────
drop policy if exists "questions: bank access" on questions;

create policy "questions: reads" on questions
  for select to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from question_banks b
      where b.id = bank_id
        and (
          b.created_by = auth.uid()
          or b.is_public = true
          or exists (
            select 1 from question_bank_shares s
            where s.bank_id = b.id and s.shared_with = auth.uid()
          )
        )
    )
  );

-- Shared users with can_edit=true may insert/update questions
drop policy if exists "questions: bank creator manages" on questions;

create policy "questions: manages" on questions
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from question_banks b
      where b.id = bank_id
        and (
          b.created_by = auth.uid()
          or exists (
            select 1 from question_bank_shares s
            where s.bank_id = b.id and s.shared_with = auth.uid() and s.can_edit = true
          )
        )
    )
  );

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on webcam_snapshots     to authenticated;
grant select, insert, update         on quiz_notifications    to authenticated;
grant select, insert, update, delete on question_bank_shares  to authenticated;
