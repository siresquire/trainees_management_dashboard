-- ── Block self-service privilege escalation on profiles ─────────────────────
--
-- The policy "profiles: users update own" is USING ((id = auth.uid()) OR
-- is_super_admin()) with no WITH CHECK. Postgres then reuses the USING
-- expression for the check, so the policy constrains *which row* a user may
-- write but never *what values* they write. Combined with the UPDATE grant
-- that `authenticated` holds on profiles.role and profiles.is_active, any
-- signed-in user could PATCH their own row to role = 'super_admin', or a
-- suspended user could set is_active = true and walk past the /suspended gate.
--
-- Guard the two privileged columns at the row level instead. This is
-- deliberately narrow: it only engages when a caller edits their OWN row, is
-- not a super admin, and is actually changing one of those columns.
--
-- Unaffected by design:
--   • full_name / avatar_url self-edits          (not privileged columns)
--   • OnlinePresence last_seen pings             (fast path, no extra query)
--   • updateStaffProfileBySA                     (super admin, and cross-row)
--   • handle_cohort_archive() is_active cascade  (writes other users' rows)
--   • handle_new_user()                          (INSERT, not UPDATE)
--   • service-role / internal callers            (no end-user JWT)

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Fast path: nothing privileged is changing. Keeps the 30-second last_seen
  -- ping — the hottest write on this table — down to one comparison.
  IF new.role IS NOT DISTINCT FROM old.role
     AND new.is_active IS NOT DISTINCT FROM old.is_active THEN
    RETURN new;
  END IF;

  -- Service-role / internal callers carry no end-user JWT; leave them alone.
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  -- Only self-edits are constrained. RLS already stops non-super-admins from
  -- touching anyone else's row, and super admins must stay able to manage staff.
  IF new.id = auth.uid() AND NOT is_super_admin() THEN
    new.role      := old.role;
    new.is_active := old.is_active;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();
