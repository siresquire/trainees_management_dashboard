import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AssignmentsClient from "./AssignmentsClient";

export default async function ProSkillsAssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: assignments }, { data: trainees }] = await Promise.all([
    supabase
      .from("pro_skills_assignments")
      .select("id, title, description, due_date, created_at, instructor_id")
      .eq("cohort_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("trainees")
      .select("id, full_name")
      .eq("cohort_id", id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("pro_skills_submissions")
        .select("assignment_id, trainee_id, completed, completed_at")
        .in("assignment_id", assignmentIds)
    : { data: [] as { assignment_id: string; trainee_id: string; completed: boolean; completed_at: string | null }[] };

  return (
    <AssignmentsClient
      cohortId={id}
      assignments={assignments ?? []}
      trainees={trainees ?? []}
      submissions={submissions ?? []}
    />
  );
}
