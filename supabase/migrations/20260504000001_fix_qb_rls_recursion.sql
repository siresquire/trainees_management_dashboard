-- =============================================================
-- Fix: infinite recursion in question_banks ↔ question_bank_shares RLS
--
-- Root cause:
--   question_banks: reads   → queries question_bank_shares (to check shares)
--   question_bank_shares: manage → queries question_banks  (to check creator)
--   → infinite loop on every question_banks access
--
-- Fix: security-definer helper functions that read each table WITHOUT
--   triggering its own RLS, breaking the cycle at both ends.
-- =============================================================

-- ── Helper: does the current user have a share row for this bank? ─────────────
create or replace function is_bank_shared_with_me(p_bank_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from question_bank_shares
    where bank_id = p_bank_id and shared_with = auth.uid()
  )
$$;

-- ── Helper: does the current user have an EDIT share for this bank? ───────────
create or replace function is_bank_editor_me(p_bank_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from question_bank_shares
    where bank_id = p_bank_id
      and shared_with = auth.uid()
      and can_edit = true
  )
$$;

-- ── question_banks: rebuild the SELECT policy ─────────────────────────────────
drop policy if exists "question_banks: reads" on question_banks;

create policy "question_banks: reads" on question_banks
  for select to authenticated
  using (
    is_super_admin()
    or created_by = auth.uid()
    or is_public = true
    or is_bank_shared_with_me(id)   -- security definer: no recursion
  );

-- ── question_bank_shares: rebuild manage policy ───────────────────────────────
-- Drop the old policy that queried question_banks (causing the reverse loop).
-- shared_by is always the bank creator's uid (set in the server action),
-- so checking it is equivalent to the old subquery.
drop policy if exists "question_bank_shares: manage" on question_bank_shares;

create policy "question_bank_shares: manage" on question_bank_shares
  for all to authenticated
  using  (is_super_admin() or shared_by = auth.uid())
  with check (is_super_admin() or shared_by = auth.uid());

-- ── questions: rebuild to use security-definer helpers ────────────────────────
drop policy if exists "questions: reads" on questions;

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
          or is_bank_shared_with_me(b.id)
        )
    )
  );

drop policy if exists "questions: manages" on questions;

create policy "questions: manages" on questions
  for all to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from question_banks b
      where b.id = bank_id
        and (
          b.created_by = auth.uid()
          or is_bank_editor_me(b.id)
        )
    )
  );
