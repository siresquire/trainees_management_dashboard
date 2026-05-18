"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssignmentState = {
  error?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
} | null;

export type GradeState = {
  error?: string;
  success?: boolean;
} | null;

// ── Create quiz assignment ────────────────────────────────────────────────────

const AssignmentSchema = z.object({
  bank_id:              z.string().uuid("Please select a question bank"),
  cohort_id:            z.string().uuid(),
  title:                z.string().min(1, "Title is required").max(200),
  mode:                 z.enum(["practice", "exam"]).default("practice"),
  questions_per_student: z.coerce.number().int().min(1).max(500).default(10),
  time_limit_mins:      z.coerce.number().int().min(1).optional(),
  attempts_allowed:     z.coerce.number().int().min(1).max(10).default(1),
  randomise:            z.boolean().default(true),
  show_results:         z.boolean().default(true),
  show_answers:         z.boolean().default(false),
  open_at:              z.string().optional(),
  close_at:             z.string().optional(),
  week_number:          z.coerce.number().int().min(0).optional(),
});

export async function createQuizAssignment(
  _prev: AssignmentState,
  formData: FormData,
): Promise<AssignmentState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile?.role ?? "")) {
    return { error: "Not authorised." };
  }

  const parsed = AssignmentSchema.safeParse({
    bank_id:               formData.get("bank_id"),
    cohort_id:             formData.get("cohort_id"),
    title:                 formData.get("title"),
    mode:                  formData.get("mode") || "practice",
    questions_per_student: formData.get("questions_per_student") || 10,
    time_limit_mins:       formData.get("time_limit_mins") || undefined,
    attempts_allowed:      formData.get("attempts_allowed") || 1,
    randomise:             formData.get("randomise") !== "0",
    show_results:          formData.get("show_results") !== "0",
    show_answers:          formData.get("show_answers") === "1",
    open_at:               formData.get("open_at") || undefined,
    close_at:              formData.get("close_at") || undefined,
    week_number:           formData.get("week_number") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const d = parsed.data;

  // Verify the bank exists and user has access
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, name")
    .eq("id", d.bank_id)
    .single();
  if (!bank) return { error: "Question bank not found or access denied." };

  // Verify question count in bank
  const { count: qCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("bank_id", d.bank_id);
  if (!qCount || qCount === 0) {
    return { error: "This question bank has no questions. Add questions before assigning." };
  }
  if (d.questions_per_student > qCount) {
    return {
      error: `The bank only has ${qCount} question${qCount === 1 ? "" : "s"}. Questions per student cannot exceed ${qCount}.`,
    };
  }

  const { error } = await supabase.from("quiz_assignments").insert({
    bank_id:               d.bank_id,
    cohort_id:             d.cohort_id,
    title:                 d.title,
    mode:                  d.mode,
    questions_per_student: d.questions_per_student,
    time_limit_mins:       d.time_limit_mins ?? null,
    attempts_allowed:      d.attempts_allowed,
    randomise:             d.randomise,
    show_results:          d.show_results,
    show_answers:          d.show_answers,
    open_at:               d.open_at ? new Date(d.open_at).toISOString() : null,
    close_at:              d.close_at ? new Date(d.close_at).toISOString() : null,
    week_number:           d.week_number ?? null,
    created_by:            user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${d.cohort_id}/quizzes`);
  return { success: true };
}

// ── Update quiz assignment ────────────────────────────────────────────────────

const UpdateSchema = AssignmentSchema.omit({ bank_id: true, cohort_id: true });

export async function updateQuizAssignment(
  assignmentId: string,
  cohortId: string,
  formData: FormData,
): Promise<AssignmentState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Verify ownership
  const { data: existing } = await supabase
    .from("quiz_assignments")
    .select("id, created_by")
    .eq("id", assignmentId)
    .single();
  if (!existing) return { error: "Assignment not found." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (existing.created_by !== user.id && profile?.role !== "super_admin") {
    return { error: "Not authorised." };
  }

  const parsed = UpdateSchema.safeParse({
    title:                 formData.get("title"),
    mode:                  formData.get("mode") || "practice",
    questions_per_student: formData.get("questions_per_student") || 10,
    time_limit_mins:       formData.get("time_limit_mins") || undefined,
    attempts_allowed:      formData.get("attempts_allowed") || 1,
    randomise:             formData.get("randomise") !== "0",
    show_results:          formData.get("show_results") !== "0",
    show_answers:          formData.get("show_answers") === "1",
    open_at:               formData.get("open_at") || undefined,
    close_at:              formData.get("close_at") || undefined,
    week_number:           formData.get("week_number") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const d = parsed.data;
  const { error } = await supabase.from("quiz_assignments").update({
    title:                 d.title,
    mode:                  d.mode,
    questions_per_student: d.questions_per_student,
    time_limit_mins:       d.time_limit_mins ?? null,
    attempts_allowed:      d.attempts_allowed,
    randomise:             d.randomise,
    show_results:          d.show_results,
    show_answers:          d.show_answers,
    open_at:               d.open_at ? new Date(d.open_at).toISOString() : null,
    close_at:              d.close_at ? new Date(d.close_at).toISOString() : null,
    week_number:           d.week_number ?? null,
  }).eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/quizzes`);
  return { success: true };
}

// ── Delete quiz assignment ────────────────────────────────────────────────────

export async function deleteQuizAssignment(
  assignmentId: string,
  cohortId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: existing } = await supabase
    .from("quiz_assignments")
    .select("id, created_by")
    .eq("id", assignmentId)
    .single();
  if (!existing) return { error: "Assignment not found." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (existing.created_by !== user.id && profile?.role !== "super_admin") {
    return { error: "Not authorised." };
  }

  const { error } = await supabase
    .from("quiz_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/quizzes`);
  return { success: true };
}

// ── Start attempt ─────────────────────────────────────────────────────────────
// Called when a trainee clicks "Start Quiz". Picks randomised question IDs,
// inserts the attempt row and returns the attempt ID.

export type QuizQuestion = {
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
};

export async function startQuizAttempt(
  assignmentId: string,
): Promise<{ error?: string; attemptId?: string; questions?: QuizQuestion[]; isResume?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Get trainee record for this user
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!trainee) return { error: "Trainee record not found." };

  // Fetch the assignment
  const { data: assignment } = await supabase
    .from("quiz_assignments")
    .select("id, bank_id, cohort_id, questions_per_student, attempts_allowed, mode, randomise, open_at, close_at")
    .eq("id", assignmentId)
    .single();
  if (!assignment) return { error: "Assignment not found." };

  // Validate window
  const now = new Date();
  if (assignment.open_at && new Date(assignment.open_at) > now) {
    return { error: "This quiz has not opened yet." };
  }
  if (assignment.close_at && new Date(assignment.close_at) < now) {
    return { error: "This quiz is closed." };
  }

  // Check existing attempts
  const { data: priorAttempts } = await supabase
    .from("quiz_attempts")
    .select("id, attempt_no, submitted_at, is_locked")
    .eq("assignment_id", assignmentId)
    .eq("trainee_id", trainee.id)
    .order("attempt_no", { ascending: false });

  const latestAttempt = priorAttempts?.[0];

  // If there's an unsubmitted attempt, resume it — also return its questions
  if (latestAttempt && !latestAttempt.submitted_at) {
    const { data: resumeAttempt } = await supabase
      .from("quiz_attempts")
      .select("question_order")
      .eq("id", latestAttempt.id)
      .single();
    const resumeIds = (resumeAttempt?.question_order as string[]) ?? [];
    const svcResume = createServiceClient();
    const { data: resumeQs } = await svcResume
      .from("questions")
      .select("id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, points, time_seconds, explanation")
      .in("id", resumeIds);
    const resumeMap = new Map((resumeQs ?? []).map((q) => [q.id, q]));
    const orderedResume = resumeIds.map((id) => resumeMap.get(id)).filter(Boolean) as QuizQuestion[];
    return { attemptId: latestAttempt.id, questions: orderedResume, isResume: true };
  }

  // Check attempt limit
  const usedAttempts = priorAttempts?.filter((a) => a.submitted_at).length ?? 0;
  if (usedAttempts >= assignment.attempts_allowed) {
    return { error: `You have used all ${assignment.attempts_allowed} attempt${assignment.attempts_allowed > 1 ? "s" : ""} for this quiz.` };
  }

  if (latestAttempt?.is_locked) {
    return { error: "Your access to this quiz is currently locked." };
  }

  // Pick questions for this attempt.
  // Use the service client so this works even if the trainee's RLS session
  // doesn't have direct access to the question bank (e.g. not yet public).
  const svc = createServiceClient();
  const { data: allQuestions } = await svc
    .from("questions")
    .select("id")
    .eq("bank_id", assignment.bank_id);

  if (!allQuestions?.length) return { error: "No questions found in this quiz." };

  let questionIds = allQuestions.map((q) => q.id);
  if (assignment.randomise) {
    // Fisher-Yates shuffle
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
    }
  }
  questionIds = questionIds.slice(0, assignment.questions_per_student);

  const nextAttemptNo = (priorAttempts?.length ?? 0) + 1;

  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({
      assignment_id:  assignmentId,
      trainee_id:     trainee.id,
      attempt_no:     nextAttemptNo,
      mode:           assignment.mode,
      question_order: questionIds,
      started_at:     new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Fetch full question data in order for the client (service client bypasses bank RLS)
  const { data: fullQs } = await svc
    .from("questions")
    .select("id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, points, time_seconds, explanation")
    .in("id", questionIds);
  const qMap = new Map((fullQs ?? []).map((q) => [q.id, q]));
  const orderedQuestions = questionIds.map((id) => qMap.get(id)).filter(Boolean) as QuizQuestion[];

  return { attemptId: attempt.id, questions: orderedQuestions, isResume: false };
}

// ── Submit attempt ────────────────────────────────────────────────────────────
// Receives all answers, auto-grades what it can, and closes the attempt.

export type AnswerInput = {
  question_id:     string;
  selected_options?: string[];
  text_answer?:     string;
};

export async function submitQuizAttempt(
  attemptId: string,
  answers: AnswerInput[],
): Promise<{ error?: string; score?: number; total?: number; passed?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Get trainee
  const { data: trainee } = await supabase
    .from("trainees").select("id").eq("user_id", user.id).single();
  if (!trainee) return { error: "Trainee record not found." };

  // Fetch attempt
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, assignment_id, trainee_id, submitted_at, question_order")
    .eq("id", attemptId)
    .single();
  if (!attempt) return { error: "Attempt not found." };
  if (attempt.trainee_id !== trainee.id) return { error: "Not your attempt." };
  if (attempt.submitted_at) return { error: "This attempt has already been submitted." };

  // Fetch assignment for scoring settings
  const { data: assignment } = await supabase
    .from("quiz_assignments")
    .select("show_results, show_answers")
    .eq("id", attempt.assignment_id)
    .single();

  // Fetch the questions for this attempt — use service client to bypass
  // question bank RLS (trainee doesn't own the bank).
  const svcForGrade = createServiceClient();
  const questionIds = attempt.question_order as string[];
  const { data: questions } = await svcForGrade
    .from("questions")
    .select("id, question_type, correct_answers, points")
    .in("id", questionIds);

  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));

  // Grade answers
  let autoScore = 0;
  let maxScore  = 0;
  const answerInserts = answers.map((ans) => {
    const q = qMap.get(ans.question_id);
    if (!q) return null;

    maxScore += Number(q.points);

    let isCorrect: boolean | null = null;
    let scoreAwarded = 0;

    const qType = q.question_type;
    if (qType === "mcq" || qType === "true_false") {
      const correct = (q.correct_answers ?? []).map((s: string) => s.toUpperCase());
      const given   = (ans.selected_options ?? []).map((s) => s.toUpperCase());
      isCorrect = correct.length === given.length &&
        correct.every((c: string) => given.includes(c));
      if (isCorrect) { scoreAwarded = Number(q.points); autoScore += scoreAwarded; }
    } else if (qType === "multi_select") {
      const correct = new Set((q.correct_answers ?? []).map((s: string) => s.toUpperCase()));
      const given   = new Set((ans.selected_options ?? []).map((s) => s.toUpperCase()));
      isCorrect =
        correct.size === given.size &&
        [...correct].every((c) => given.has(c));
      if (isCorrect) { scoreAwarded = Number(q.points); autoScore += scoreAwarded; }
    }
    // short_answer / code_input → null (manual grading needed)

    return {
      attempt_id:       attemptId,
      question_id:      ans.question_id,
      selected_options: ans.selected_options ?? null,
      text_answer:      ans.text_answer ?? null,
      is_correct:       isCorrect,
      score_awarded:    isCorrect === null ? null : scoreAwarded,
    };
  }).filter(Boolean);

  // Upsert answers
  if (answerInserts.length) {
    const { error: ansErr } = await supabase
      .from("quiz_answers")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(answerInserts as any[], { onConflict: "attempt_id,question_id" });
    if (ansErr) return { error: ansErr.message };
  }

  // Close attempt
  const { error: closeErr } = await supabase
    .from("quiz_attempts")
    .update({
      submitted_at: new Date().toISOString(),
      auto_score:   autoScore,
    })
    .eq("id", attemptId);
  if (closeErr) return { error: closeErr.message };

  revalidatePath("/trainee/quizzes");

  if (assignment?.show_results) {
    const pct = maxScore > 0 ? Math.round((autoScore / maxScore) * 100) : 0;
    return { score: autoScore, total: maxScore, passed: pct >= 70 };
  }
  return { score: undefined, total: undefined };
}

// ── Save answer (autosave during quiz) ───────────────────────────────────────

export async function saveQuizAnswer(
  attemptId: string,
  questionId: string,
  selectedOptions: string[],
  textAnswer: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("quiz_answers")
    .upsert(
      {
        attempt_id:       attemptId,
        question_id:      questionId,
        selected_options: selectedOptions.length ? selectedOptions : null,
        text_answer:      textAnswer || null,
      },
      { onConflict: "attempt_id,question_id" },
    );
  if (error) return { error: error.message };
  return {};
}

// ── Grade manual answers ───────────────────────────────────────────────────────

export async function gradeManualAnswers(
  formData: FormData,
): Promise<GradeState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const attemptId = formData.get("attempt_id") as string;
  if (!attemptId) return { error: "Missing attempt ID." };

  // Collect all grade entries: grade_<answerId> = points
  const updates: Array<{ id: string; score: number; is_correct: boolean }> = [];
  formData.forEach((value, key) => {
    if (key.startsWith("grade_")) {
      const answerId = key.slice(6);
      const score = parseFloat(String(value));
      if (!isNaN(score)) {
        updates.push({ id: answerId, score, is_correct: score > 0 });
      }
    }
  });

  if (!updates.length) return { error: "No grades submitted." };

  // Verify trainer has access to this attempt via cohort
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, assignment_id")
    .eq("id", attemptId)
    .single();
  if (!attempt) return { error: "Attempt not found." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile?.role ?? "")) {
    return { error: "Not authorised." };
  }

  for (const { id, score, is_correct } of updates) {
    await supabase
      .from("quiz_answers")
      .update({ score_awarded: score, is_correct, graded_by: user.id, graded_at: new Date().toISOString() })
      .eq("id", id)
      .eq("attempt_id", attemptId);
  }

  // Recalculate manual score for the attempt (sum of all score_awarded)
  const { data: allAnswers } = await supabase
    .from("quiz_answers")
    .select("score_awarded")
    .eq("attempt_id", attemptId);
  const manualScore = (allAnswers ?? []).reduce(
    (sum, a) => sum + (a.score_awarded ?? 0), 0
  );

  await supabase
    .from("quiz_attempts")
    .update({ manual_score: manualScore })
    .eq("id", attemptId);

  revalidatePath("/trainer/cohorts");
  return { success: true };
}

// ── Publish quiz scores to Exam Dashboard ─────────────────────────────────────
// Creates an exam_quiz + exam_scores rows so the scores appear on the Exams tab.

export async function publishQuizToExams(
  assignmentId: string,
  cohortId: string,
): Promise<{ error?: string; success?: boolean; examQuizId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["trainer", "quiz_creator", "super_admin"].includes(profile?.role ?? "")) {
    return { error: "Not authorised." };
  }

  // Fetch the assignment
  const { data: assignment } = await supabase
    .from("quiz_assignments")
    .select("id, title, week_number, published_exam_quiz_id, bank_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment) return { error: "Assignment not found." };

  // Calculate max score from the questions in this bank
  const svc = createServiceClient();
  const { data: questions } = await svc
    .from("questions")
    .select("points")
    .eq("bank_id", assignment.bank_id);
  const maxPoints = (questions ?? []).reduce((s, q) => s + Number(q.points), 0) || 100;

  // Fetch all submitted attempts — best attempt per trainee
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, trainee_id, attempt_no, final_score, submitted_at")
    .eq("assignment_id", assignmentId)
    .not("submitted_at", "is", null)
    .order("final_score", { ascending: false });

  if (!attempts?.length) return { error: "No submitted attempts to publish." };

  // Best attempt per trainee
  const bestByTrainee = new Map<string, { attempt_no: number; score: number; submitted_at: string }>();
  for (const a of attempts) {
    if (!a.trainee_id) continue;
    if (!bestByTrainee.has(a.trainee_id)) {
      bestByTrainee.set(a.trainee_id, {
        attempt_no:   a.attempt_no,
        score:        a.final_score ?? 0,
        submitted_at: a.submitted_at!,
      });
    }
  }

  let examQuizId = assignment.published_exam_quiz_id;

  if (!examQuizId) {
    // Create a new exam_quiz record
    const { data: eq, error: eqErr } = await supabase
      .from("exam_quizzes")
      .insert({
        cohort_id:       cohortId,
        quiz_name:       assignment.title,
        focus_type:      "other",
        week_number:     assignment.week_number ?? 0,
        max_score:       maxPoints,
        source_platform: "built_in",
        created_by:      user.id,
      })
      .select("id")
      .single();
    if (eqErr || !eq) return { error: eqErr?.message ?? "Failed to create exam quiz record." };
    examQuizId = eq.id;

    // Link back to the assignment
    await svc
      .from("quiz_assignments")
      .update({ published_exam_quiz_id: examQuizId })
      .eq("id", assignmentId);
  } else {
    // Already published — wipe existing scores and refresh max_score in case bank changed
    await supabase.from("exam_scores").delete().eq("quiz_id", examQuizId);
    await svc
      .from("exam_quizzes")
      .update({ max_score: maxPoints })
      .eq("id", examQuizId);
  }

  // Insert exam_scores — store raw score; the Exam Dashboard divides by max_score itself
  const inserts = [...bestByTrainee.entries()].map(([traineeId, best]) => ({
    quiz_id:     examQuizId!,
    trainee_id:  traineeId,
    attempt_no:  best.attempt_no,
    score:       best.score ?? 0,
    uploaded_at: best.submitted_at,
  }));

  const { error: scoresErr } = await supabase.from("exam_scores").insert(inserts);
  if (scoresErr) return { error: scoresErr.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/quizzes`);
  revalidatePath(`/trainer/cohorts/${cohortId}/exams`);
  return { success: true, examQuizId };
}
