import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TraineesClient from "./TraineesClient";

export default async function ProSkillsCohortTraineesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const [
    { data: cohortData },
    { data: trainees },
    { data: sessions },
    { data: assignments },
  ] = await Promise.all([
    svc
      .from("cohorts")
      .select("level")
      .eq("id", id)
      .single(),
    svc
      .from("trainees")
      .select("id, full_name, personal_email, amalitech_email")
      .eq("cohort_id", id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    svc
      .from("pro_skills_sessions")
      .select("id, title, session_date, topic")
      .eq("cohort_id", id)
      .order("session_date", { ascending: true }),
    svc
      .from("pro_skills_assignments")
      .select("id, title, due_date")
      .eq("cohort_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const { data: attendanceRows } = await svc
    .from("pro_skills_attendance")
    .select("session_id, trainee_id, status, pro_skills_sessions!inner(cohort_id)")
    .eq("pro_skills_sessions.cohort_id", id);

  const { data: submissionRows } = await svc
    .from("pro_skills_submissions")
    .select("assignment_id, trainee_id, completed, pro_skills_assignments!inner(cohort_id)")
    .eq("pro_skills_assignments.cohort_id", id);

  return (
    <TraineesClient
      cohortId={id}
      cohortLevel={cohortData?.level ?? ""}
      trainees={trainees ?? []}
      sessions={sessions ?? []}
      attendance={(attendanceRows ?? []).map((r) => ({
        session_id: r.session_id,
        trainee_id: r.trainee_id,
        status: r.status,
      }))}
      assignments={assignments ?? []}
      submissions={(submissionRows ?? []).map((r) => ({
        assignment_id: r.assignment_id,
        trainee_id: r.trainee_id,
        completed: r.completed,
      }))}
    />
  );
}
