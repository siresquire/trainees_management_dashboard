-- ── Fix trainee ↔ auth-user linking gaps ─────────────────────────────────────
--
-- Symptom: a trainee visits their dashboard but the trainer's Visits column
-- shows "—". record_trainee_visit() updates trainees WHERE user_id =
-- auth.uid(), so an unlinked/mislinked record never increments.
--
-- Two gaps caused records to be left unlinked:
--   1. link_trainee_on_signup only fires when an AUTH USER is created. A
--      trainee record created AFTER the account exists (roster re-upload,
--      re-added trainee, moved cohorts) never gets linked.
--   2. Linking only matched personal_email — accounts created with the
--      amalitech_email (e.g. training.learner.NN@amalitechtraining.org)
--      never matched.

-- 1. Backfill: link every unlinked, non-deleted trainee record whose
--    personal OR amalitech email matches an existing auth account.
UPDATE trainees t
SET user_id = u.id
FROM auth.users u
WHERE t.user_id IS NULL
  AND t.deleted_at IS NULL
  AND (
    lower(t.personal_email)  = lower(u.email)
    OR lower(t.amalitech_email) = lower(u.email)
  );

-- 2. Signup trigger now matches both emails.
CREATE OR REPLACE FUNCTION link_trainee_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.trainees
  SET user_id = new.id
  WHERE user_id IS NULL
    AND (
      lower(personal_email)  = lower(new.email)
      OR lower(amalitech_email) = lower(new.email)
    );
  RETURN new;
END;
$$;

-- 3. New: link at trainee-row creation/update time when the auth account
--    already exists. Closes the roster-re-upload gap permanently.
CREATE OR REPLACE FUNCTION link_user_on_trainee_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.user_id IS NULL THEN
    SELECT u.id INTO new.user_id
    FROM auth.users u
    WHERE lower(u.email) = lower(new.personal_email)
       OR (new.amalitech_email IS NOT NULL AND lower(u.email) = lower(new.amalitech_email))
    LIMIT 1;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_trainee_link_user ON trainees;
CREATE TRIGGER on_trainee_link_user
  BEFORE INSERT OR UPDATE OF personal_email, amalitech_email ON trainees
  FOR EACH ROW EXECUTE FUNCTION link_user_on_trainee_change();
