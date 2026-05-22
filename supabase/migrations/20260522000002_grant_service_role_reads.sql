-- Grant SELECT to service_role on all tables used by admin dashboard server
-- queries (service_role bypasses RLS but still needs explicit GRANT to run
-- direct PostgREST queries through the Supabase JS client).
GRANT SELECT ON
  cohort_week_tasks,
  sessions,
  attendance,
  cohort_access,
  profiles,
  trainees,
  vouchers,
  admin_voucher_pool,
  exam_quizzes,
  exam_scores,
  exam_appointments
TO service_role;
