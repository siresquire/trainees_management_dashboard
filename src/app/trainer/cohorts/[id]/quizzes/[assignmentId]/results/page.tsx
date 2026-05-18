import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ResultsClient from "./ResultsClient";

export default async function QuizResultsPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id: cohortId, assignmentId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Assignment
  const { data: assignment } = await supabase
    .from("quiz_assignments")
    .select("id, title, mode, questions_per_student, time_limit_mins, attempts_allowed, show_answers, created_by, bank_id, published_exam_quiz_id, question_banks(name)")
    .eq("id", assignmentId)
    .single();
  if (!assignment) notFound();

  // All submitted attempts for this assignment, with trainee info
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select(`
      id, attempt_no, submitted_at, auto_score, manual_score, final_score, started_at,
      trainees ( id, full_name, personal_email, serial_no )
    `)
    .eq("assignment_id", assignmentId)
    .not("submitted_at", "is", null)
    .order("final_score", { ascending: false });

  // Questions for this bank (for the detail view)
  const svc = createServiceClient();
  const { data: questions } = await svc
    .from("questions")
    .select("id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, correct_answers, points, explanation")
    .eq("bank_id", assignment.bank_id)
    .order("display_order");

  // Max possible score
  const maxPoints = (questions ?? []).reduce((s, q) => s + Number(q.points), 0);

  // All answers for all attempts (for detail drill-down)
  const attemptIds = (attempts ?? []).map((a) => a.id);
  let answers: Array<{
    id: string;
    attempt_id: string;
    question_id: string;
    selected_options: string[] | null;
    text_answer: string | null;
    is_correct: boolean | null;
    score_awarded: number | null;
  }> = [];
  if (attemptIds.length) {
    const { data: ans } = await supabase
      .from("quiz_answers")
      .select("id, attempt_id, question_id, selected_options, text_answer, is_correct, score_awarded")
      .in("attempt_id", attemptIds);
    answers = ans ?? [];
  }

  // Trainee count for this cohort (to show "X / N completed")
  const { count: traineeCount } = await supabase
    .from("trainees")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .is("deleted_at", null);

  return (
    <ResultsClient
      cohortId={cohortId}
      assignment={{
        id:                  assignment.id,
        title:               assignment.title,
        mode:                assignment.mode,
        show_answers:        assignment.show_answers,
        published_exam_quiz_id: assignment.published_exam_quiz_id ?? null,
        bank_name:           (assignment.question_banks as { name: string } | null)?.name ?? "",
      }}
      attempts={attempts ?? []}
      questions={questions ?? []}
      answers={answers}
      maxPoints={maxPoints}
      traineeCount={traineeCount ?? 0}
    />
  );
}
