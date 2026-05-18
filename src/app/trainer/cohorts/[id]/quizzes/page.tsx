import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import QuizzesClient from "./QuizzesClient";

export default async function CohortQuizzesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: cohortId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Assignments for this cohort, newest first
  const { data: assignments } = await supabase
    .from("quiz_assignments")
    .select(`
      id, title, mode, questions_per_student, time_limit_mins,
      attempts_allowed, randomise, show_results, show_answers,
      open_at, close_at, week_number, created_at, created_by,
      question_banks ( id, name )
    `)
    .eq("cohort_id", cohortId)
    .order("created_at", { ascending: false });

  // Per-assignment attempt counts for quick stats
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  let attemptStats: Array<{ assignment_id: string; count: number }> = [];
  if (assignmentIds.length) {
    // Count submitted attempts per assignment
    const { data: counts } = await supabase
      .from("quiz_attempts")
      .select("assignment_id")
      .in("assignment_id", assignmentIds)
      .not("submitted_at", "is", null);
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) {
      countMap.set(r.assignment_id, (countMap.get(r.assignment_id) ?? 0) + 1);
    }
    attemptStats = [...countMap.entries()].map(([assignment_id, count]) => ({
      assignment_id,
      count,
    }));
  }

  // Trainee count for this cohort (for context)
  const { count: traineeCount } = await supabase
    .from("trainees")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .is("deleted_at", null);

  // Question banks this user can access (for assignment form)
  const { data: banks } = await supabase
    .from("question_banks")
    .select("id, name, level")
    .order("name");

  if (!assignments && !banks) notFound();

  return (
    <QuizzesClient
      cohortId={cohortId}
      assignments={assignments ?? []}
      attemptStats={attemptStats}
      traineeCount={traineeCount ?? 0}
      banks={banks ?? []}
      userId={user.id}
    />
  );
}
