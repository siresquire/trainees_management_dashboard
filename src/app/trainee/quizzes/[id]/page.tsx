import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import QuizTaker from "./QuizTaker";

export default async function TakeQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: assignmentId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Trainee record
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, cohort_id, full_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();
  if (!trainee) redirect("/trainee/quizzes");

  // Assignment
  const { data: assignment } = await supabase
    .from("quiz_assignments")
    .select("id, title, mode, questions_per_student, time_limit_mins, attempts_allowed, randomise, show_results, show_answers, open_at, close_at, cohort_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment) notFound();

  // Verify belongs to trainee's cohort
  if (assignment.cohort_id !== trainee.cohort_id) notFound();

  // Check window
  const now = new Date();
  const isClosed = assignment.close_at && new Date(assignment.close_at) < now;
  const isNotOpen = assignment.open_at && new Date(assignment.open_at) > now;

  // Get trainee's existing attempts for this assignment
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, attempt_no, submitted_at, final_score, auto_score, question_order, started_at")
    .eq("assignment_id", assignmentId)
    .eq("trainee_id", trainee.id)
    .order("attempt_no", { ascending: false });

  const latestAttempt = attempts?.[0];
  const submittedCount = (attempts ?? []).filter((a) => a.submitted_at).length;
  const inProgressAttempt = attempts?.find((a) => !a.submitted_at);

  // If there's an in-progress attempt, load its questions and saved answers
  let questions: Array<{
    id: string;
    question_text: string;
    question_type: string;
    option_a: string | null;
    option_b: string | null;
    option_c: string | null;
    option_d: string | null;
    option_e: string | null;
    option_f: string | null;
    points: number;
    time_seconds: number | null;
    explanation: string | null;
  }> = [];

  let savedAnswers: Array<{
    question_id: string;
    selected_options: string[] | null;
    text_answer: string | null;
  }> = [];

  if (inProgressAttempt) {
    const qIds = (inProgressAttempt.question_order as string[]) ?? [];
    if (qIds.length) {
      // Use service client so trainees can read questions regardless of bank
      // visibility (bank may not be public, but the trainee has an assignment).
      const svc = createServiceClient();
      const { data: qs } = await svc
        .from("questions")
        .select("id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, points, time_seconds, explanation")
        .in("id", qIds);

      // Preserve the randomised order from question_order
      const qMap = new Map((qs ?? []).map((q) => [q.id, q]));
      questions = qIds.map((qid) => qMap.get(qid)).filter(Boolean) as typeof questions;

      // Saved answers still use the trainee's session (their own rows)
      const { data: answers } = await supabase
        .from("quiz_answers")
        .select("question_id, selected_options, text_answer")
        .eq("attempt_id", inProgressAttempt.id);
      savedAnswers = answers ?? [];
    }
  }

  return (
    <QuizTaker
      assignment={{
        id: assignment.id,
        title: assignment.title,
        mode: assignment.mode,
        time_limit_mins: assignment.time_limit_mins,
        attempts_allowed: assignment.attempts_allowed,
        show_results: assignment.show_results,
        show_answers: assignment.show_answers,
      }}
      traineeId={trainee.id}
      submittedCount={submittedCount}
      inProgressAttemptId={inProgressAttempt?.id ?? null}
      questions={questions}
      savedAnswers={savedAnswers}
      isClosed={!!isClosed}
      isNotOpen={!!isNotOpen}
    />
  );
}
