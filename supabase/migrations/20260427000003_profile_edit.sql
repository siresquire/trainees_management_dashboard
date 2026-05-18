-- ── get_profile_by_email ──────────────────────────────────────────────────
-- Security-definer function so staff login can look up a user by email
-- without relying on auth.admin.getUserByEmail (not in supabase-js v2).
create or replace function get_profile_by_email(p_email text)
returns table (
  user_id   uuid,
  role      user_role,
  is_active boolean
) language plpgsql security definer set search_path = public, auth as $$
begin
  return query
  select p.id, p.role, p.is_active
  from   auth.users   u
  join   public.profiles p on p.id = u.id
  where  lower(u.email) = lower(p_email)
  limit  1;
end;
$$;

grant execute on function get_profile_by_email(text) to authenticated, service_role;

-- ── email_change_requests ─────────────────────────────────────────────────
-- Trainers / QC request an email change; SA approves.
-- FK references profiles(id) so PostgREST can join.
create table if not exists email_change_requests (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references profiles(id) on delete cascade,
  current_email    text        not null,
  requested_email  text        not null,
  reason           text,
  status           text        not null default 'pending'
                               check (status in ('pending', 'approved', 'denied')),
  notes            text,
  reviewed_by      uuid        references profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table email_change_requests enable row level security;

-- Users can see their own requests
create policy "ecr_own_select" on email_change_requests
  for select to authenticated using (user_id = auth.uid());

-- Users can submit a request for themselves
create policy "ecr_own_insert" on email_change_requests
  for insert to authenticated with check (user_id = auth.uid());

-- Super admin has full access
create policy "ecr_sa_all" on email_change_requests
  for all to authenticated using (is_super_admin())
  with check (is_super_admin());
