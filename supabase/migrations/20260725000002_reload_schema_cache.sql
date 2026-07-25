-- Force PostgREST to reload its schema cache so the new 'manual' session_platform
-- enum value (added in the previous migration) is recognized immediately.
NOTIFY pgrst, 'reload schema';
