import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TraineeExamsClient from "./TraineeExamsClient";

export default async function TraineeExamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, personal_email, cohort_id, status, show_readiness, graduated, cohorts(name, level)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!trainee) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-2">My Exams</h1>
        <p className="text-slate-500 text-sm">You are not currently enrolled in any active cohort.</p>
      </div>
    );
  }

  const cohort = trainee.cohorts as { name: string; level: string } | null;

  const [
    { data: quizzes },
    { data: myOutcomes },
    { data: examSchedule },
  ] = await Promise.all([
    supabase.from("exam_quizzes")
      .select("id, quiz_name, focus_type, focus_label, week_number, quiz_date, max_score")
      .eq("cohort_id", trainee.cohort_id)
      .order("created_at", { ascending: true }),
    supabase.from("exam_outcomes")
      .select("id, exam_type, actual_score, outcome, exam_date, attempt_no, notes, self_reported")
      .eq("trainee_id", trainee.id)
      .order("attempt_no", { ascending: true }),
    createServiceClient()
      .from("exam_schedules")
      .select("id, first_name, last_name, other_names, personal_email, cohort_display_name, region, aws_account_id, aws_cert_email, canvas_grad_status, batch_number, voucher_issued, submitted_at")
      .eq("trainee_id", trainee.id)
      .maybeSingle(),
  ]);

  const quizIds = (quizzes ?? []).map((q) => q.id);

  const [{ data: myScores }, { data: allScores }] = await Promise.all([
    quizIds.length
      ? supabase.from("exam_scores").select("quiz_id, score, attempt_no, uploaded_at").eq("trainee_id", trainee.id).in("quiz_id", quizIds)
      : Promise.resolve({ data: [] as { quiz_id: string; score: number; attempt_no: number; uploaded_at: string }[] }),
    quizIds.length
      ? supabase.from("exam_scores").select("quiz_id, trainee_id, score").in("quiz_id", quizIds)
      : Promise.resolve({ data: [] as { quiz_id: string; trainee_id: string; score: number }[] }),
  ]);

  // Best score per quiz
  const myBestMap = new Map<string, number>();
  for (const s of myScores ?? []) {
    const prev = myBestMap.get(s.quiz_id);
    if (prev === undefined || s.score > prev) myBestMap.set(s.quiz_id, s.score);
  }

  // Ranking per quiz
  const allBestPerQuiz = new Map<string, Map<string, number>>();
  for (const s of allScores ?? []) {
    let qmap = allBestPerQuiz.get(s.quiz_id);
    if (!qmap) { qmap = new Map(); allBestPerQuiz.set(s.quiz_id, qmap); }
    const prev = qmap.get(s.trainee_id);
    if (prev === undefined || s.score > prev) qmap.set(s.trainee_id, s.score);
  }
  const myRankMap = new Map<string, { rank: number; total: number }>();
  for (const [qId, qmap] of allBestPerQuiz) {
    const myBest = myBestMap.get(qId);
    if (myBest === undefined) continue;
    const sorted = Array.from(qmap.values()).sort((a, b) => b - a);
    const rank   = sorted.findIndex((s) => s <= myBest) + 1;
    myRankMap.set(qId, { rank, total: sorted.length });
  }

  // Eligibility
  const pcts: number[] = [];
  for (const q of quizzes ?? []) {
    const best = myBestMap.get(q.id);
    if (best !== undefined) pcts.push((best / (q.max_score ?? 100)) * 100);
  }
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;

  // Parse first/last name from full_name for pre-fill
  const nameParts = (trainee.full_name ?? "").trim().split(/\s+/);
  const defaultFirstName = nameParts[0] ?? "";
  const defaultLastName  = nameParts.slice(1).join(" ") || "";

  return (
    <TraineeExamsClient
      traineeId={trainee.id}
      cohortId={trainee.cohort_id}
      cohortName={cohort?.name ?? null}
      cohortLevel={cohort?.level ?? "practitioner"}
      showReadiness={(trainee.show_readiness ?? false) || (avgPct !== null && avgPct >= 65)}
      graduated={trainee.graduated ?? false}
      personalEmail={trainee.personal_email ?? ""}
      defaultFirstName={defaultFirstName}
      defaultLastName={defaultLastName}
      quizzes={(quizzes ?? []).map((q) => ({
        id:          q.id,
        quiz_name:   q.quiz_name,
        focus_type:  (q.focus_type  as string) ?? "practitioner",
        focus_label: (q.focus_label as string | null) ?? null,
        week_number: q.week_number as number,
        quiz_date:   (q.quiz_date   as string | null) ?? null,
        max_score:   (q.max_score   as number) ?? 100,
      }))}
      myBestMap={Object.fromEntries(myBestMap)}
      myRankMap={Object.fromEntries(myRankMap)}
      avgPct={avgPct}
      quizCount={pcts.length}
      outcomes={(myOutcomes ?? []).map((o) => ({
        id:            o.id,
        exam_type:     o.exam_type as string,
        actual_score:  (o.actual_score as number | null) ?? null,
        outcome:       o.outcome as string,
        exam_date:     (o.exam_date as string | null) ?? null,
        attempt_no:    o.attempt_no as number,
        notes:         (o.notes as string | null) ?? null,
        self_reported: (o.self_reported as boolean) ?? false,
      }))}
      existingSchedule={examSchedule ? {
        id:                 examSchedule.id,
        first_name:         examSchedule.first_name as string,
        last_name:          examSchedule.last_name as string,
        other_names:        (examSchedule.other_names as string | null) ?? null,
        personal_email:     examSchedule.personal_email as string,
        cohort_display_name: examSchedule.cohort_display_name as string,
        region:             examSchedule.region as string,
        aws_account_id:     (examSchedule.aws_account_id as string | null) ?? null,
        aws_cert_email:     (examSchedule.aws_cert_email as string | null) ?? null,
        canvas_grad_status: examSchedule.canvas_grad_status as string,
        batch_number:       (examSchedule.batch_number as number | null) ?? null,
        voucher_issued:     examSchedule.voucher_issued as boolean,
        submitted_at:       examSchedule.submitted_at as string,
      } : null}
    />
  );
}
