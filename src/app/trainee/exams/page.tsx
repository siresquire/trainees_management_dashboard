import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TraineeExamsClient from "./TraineeExamsClient";

export default async function TraineeExamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Trainee record + cohort details
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, full_name, cohort_id, status, show_readiness, cohorts(name, level)")
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

  // Quizzes for this cohort, ordered by creation date
  const { data: quizzes } = await supabase
    .from("exam_quizzes")
    .select("id, quiz_name, focus_type, focus_label, week_number, quiz_date, max_score")
    .eq("cohort_id", trainee.cohort_id)
    .order("created_at", { ascending: true });

  const quizIds = (quizzes ?? []).map((q) => q.id);

  // My scores
  const { data: myScores } = quizIds.length
    ? await supabase
        .from("exam_scores")
        .select("quiz_id, score, attempt_no, uploaded_at")
        .eq("trainee_id", trainee.id)
        .in("quiz_id", quizIds)
    : { data: [] };

  // All scores in these quizzes for ranking
  const { data: allScores } = quizIds.length
    ? await supabase
        .from("exam_scores")
        .select("quiz_id, trainee_id, score")
        .in("quiz_id", quizIds)
    : { data: [] };

  // My vouchers
  const { data: myVouchers } = await supabase
    .from("vouchers")
    .select("id, exam_type, issued_date, attempt_no, voucher_code")
    .eq("trainee_id", trainee.id)
    .order("created_at", { ascending: true });

  // My official exam outcomes
  const { data: myOutcomes } = await supabase
    .from("exam_outcomes")
    .select("id, exam_type, actual_score, outcome, exam_date, attempt_no, notes, self_reported")
    .eq("trainee_id", trainee.id)
    .order("attempt_no", { ascending: true });

  // ── Compute best score per quiz ───────────────────────────────────────────
  const myBestMap = new Map<string, number>();
  for (const s of myScores ?? []) {
    const prev = myBestMap.get(s.quiz_id);
    if (prev === undefined || s.score > prev) myBestMap.set(s.quiz_id, s.score);
  }

  // ── Compute ranking per quiz ──────────────────────────────────────────────
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

  // ── Eligibility ───────────────────────────────────────────────────────────
  const pcts: number[] = [];
  for (const q of quizzes ?? []) {
    const best = myBestMap.get(q.id);
    if (best !== undefined) pcts.push((best / (q.max_score ?? 100)) * 100);
  }
  const avgPct = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;

  return (
    <TraineeExamsClient
      traineeId={trainee.id}
      cohortName={cohort?.name ?? null}
      cohortLevel={cohort?.level ?? "practitioner"}
      showReadiness={trainee.show_readiness ?? false}
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
      vouchers={(myVouchers ?? []).map((v) => ({
        id:           v.id,
        exam_type:    v.exam_type as string,
        issued_date:  v.issued_date as string,
        attempt_no:   v.attempt_no as number,
        voucher_code: (v.voucher_code as string | null) ?? null,
      }))}
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
    />
  );
}
