-- ── Make my_trainee_id() deterministic ───────────────────────────────────────
--
-- Symptom: a trainee who holds more than one enrollment (e.g. a practitioner
-- graduate who then joined an associate cohort) has several trainees rows
-- pointing at the same user_id. my_trainee_id() used a bare LIMIT 1 with no
-- ORDER BY, so it returned an arbitrary row — meaning the 19 RLS policies
-- built on it could resolve to a *past* enrollment and deny the trainee access
-- to their own current records.
--
-- Resolve the current enrollment instead, using the same rule the app applies:
-- active before inactive, in-progress before graduated, newest first.

CREATE OR REPLACE FUNCTION public.my_trainee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM trainees
  WHERE user_id    = auth.uid()
    AND deleted_at IS NULL
  ORDER BY (status = 'active') DESC,
           graduated           ASC,
           created_at          DESC
  LIMIT 1
$$;
