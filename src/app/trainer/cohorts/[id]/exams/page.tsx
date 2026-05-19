import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamsClient from "./ExamsClient";
import { fitModels, type TrainingPoint, type ModelBundle } from "@/lib/regression";

export default async function ExamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, exam_type")
    .eq("id", id)
    .single();

  // Active non-deleted trainees for this cohort
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, serial_no, full_name, personal_email, amalitech_email, show_readiness")
    .eq("cohort_id", id)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("serial_no", { ascending: true, nullsFirst: false });

  // Quizzes / tests for this cohort
  const { data: quizzes } = await supabase
    .from("exam_quizzes")
    .select("id, quiz_name, focus_type, focus_label, week_number, quiz_date, max_score, created_at")
    .eq("cohort_id", id)
    .order("created_at", { ascending: true });

  const traineeIds = (trainees ?? []).map((t) => t.id);
  const quizIds    = (quizzes  ?? []).map((q) => q.id);

  // All scores for these quizzes
  const { data: scores } = quizIds.length
    ? await supabase
        .from("exam_scores")
        .select("id, quiz_id, trainee_id, score, attempt_no, uploaded_at")
        .in("quiz_id", quizIds)
    : { data: [] };

  // Vouchers for trainees in this cohort
  const { data: vouchers } = traineeIds.length
    ? await supabase
        .from("vouchers")
        .select("id, trainee_id, exam_type, issued_date, attempt_no, voucher_code")
        .in("trainee_id", traineeIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  // Pre-uploaded (unissued) voucher codes for this cohort
  const { data: pooledVouchers } = traineeIds.length
    ? await supabase
        .from("voucher_pool")
        .select("id, trainee_id, voucher_code")
        .eq("cohort_id", id)
        .eq("is_used", false)
        .not("trainee_id", "is", null)
    : { data: [] };

  // Official exam outcomes for trainees in this cohort
  const { data: outcomes } = traineeIds.length
    ? await supabase
        .from("exam_outcomes")
        .select("id, trainee_id, exam_type, actual_score, outcome, exam_date, attempt_no, notes, self_reported")
        .in("trainee_id", traineeIds)
        .order("attempt_no", { ascending: true })
    : { data: [] };

  // ── Regression: build training set from ALL same-level cohorts ──────────────

  const cohortLevel = cohort?.level ?? "practitioner";

  // 1. All cohort IDs of the same level (including the current one)
  const { data: sameLevelCohorts } = await supabase
    .from("cohorts")
    .select("id")
    .eq("level", cohortLevel);

  const allCohortIds = (sameLevelCohorts ?? []).map((c) => c.id);

  // 2. All trainees across those cohorts
  const { data: allCohortTrainees } = allCohortIds.length
    ? await supabase
        .from("trainees")
        .select("id, cohort_id")
        .in("cohort_id", allCohortIds)
        .is("deleted_at", null)
    : { data: [] };

  const allTraineeIds = (allCohortTrainees ?? []).map((t) => t.id);
  // Map trainee → cohort for quick lookup
  const traineeCohortMap = new Map<string, string>(
    (allCohortTrainees ?? []).map((t) => [t.id, t.cohort_id])
  );

  // 3. First-attempt exam outcomes (passed/failed) — these are our training labels
  const { data: historicalOutcomes } = allTraineeIds.length
    ? await supabase
        .from("exam_outcomes")
        .select("trainee_id, actual_score, outcome, attempt_no")
        .in("trainee_id", allTraineeIds)
        .in("outcome", ["passed", "failed"])
        .eq("attempt_no", 1)
    : { data: [] };

  const labelledTraineeIds = [...new Set((historicalOutcomes ?? []).map((o) => o.trainee_id))];

  // 4. Quiz scores for labelled trainees (to compute quiz avg feature)
  const { data: allQuizzes } = allCohortIds.length
    ? await supabase
        .from("exam_quizzes")
        .select("id, cohort_id, max_score")
        .in("cohort_id", allCohortIds)
    : { data: [] };

  const allQuizIds = (allQuizzes ?? []).map((q) => q.id);

  const { data: allExamScores } = allQuizIds.length && labelledTraineeIds.length
    ? await supabase
        .from("exam_scores")
        .select("trainee_id, quiz_id, score, attempt_no")
        .in("quiz_id", allQuizIds)
        .in("trainee_id", labelledTraineeIds)
    : { data: [] };

  // 5. Tasks per cohort (to know totals for completion rates)
  const { data: allTasks } = allCohortIds.length
    ? await supabase
        .from("cohort_week_tasks")
        .select("id, cohort_id, task_type")
        .in("cohort_id", allCohortIds)
    : { data: [] };

  const allTaskIds = (allTasks ?? []).map((t) => t.id);

  // 6. Completions for current cohort trainees (for current-cohort feature computation)
  //    and labelled historical trainees (for training)
  const completionTargetIds = [...new Set([...traineeIds, ...labelledTraineeIds])];
  const { data: allCompletions } = completionTargetIds.length && allTaskIds.length
    ? await supabase
        .from("completions")
        .select("trainee_id, task_id")
        .in("trainee_id", completionTargetIds)
        .in("task_id", allTaskIds)
    : { data: [] };

  // ── Pre-compute lookup structures ────────────────────────────────────────────

  // Tasks per cohort, split by type
  const labsPerCohort   = new Map<string, string[]>();
  const kcsPerCohort    = new Map<string, string[]>();
  const quizzesByCohort = new Map<string, { id: string; max_score: number }[]>();

  for (const t of allTasks ?? []) {
    if (t.task_type === "lab") {
      const arr = labsPerCohort.get(t.cohort_id) ?? [];
      arr.push(t.id);
      labsPerCohort.set(t.cohort_id, arr);
    } else if (t.task_type === "kc") {
      const arr = kcsPerCohort.get(t.cohort_id) ?? [];
      arr.push(t.id);
      kcsPerCohort.set(t.cohort_id, arr);
    }
  }
  for (const q of allQuizzes ?? []) {
    const arr = quizzesByCohort.get(q.cohort_id) ?? [];
    arr.push({ id: q.id, max_score: q.max_score });
    quizzesByCohort.set(q.cohort_id, arr);
  }

  // Completions per trainee (set of completed task_ids)
  const completedByTrainee = new Map<string, Set<string>>();
  for (const c of allCompletions ?? []) {
    const s = completedByTrainee.get(c.trainee_id) ?? new Set<string>();
    s.add(c.task_id);
    completedByTrainee.set(c.trainee_id, s);
  }

  // Best score per trainee per quiz (across all attempts)
  const bestExamScore = new Map<string, number>(); // `${traineeId}:${quizId}` → best
  for (const s of allExamScores ?? []) {
    const key  = `${s.trainee_id}:${s.quiz_id}`;
    const prev = bestExamScore.get(key);
    if (prev === undefined || s.score > prev) bestExamScore.set(key, s.score);
  }

  // ── Feature extraction helper ────────────────────────────────────────────────

  function extractFeatures(traineeId: string, cohortId: string) {
    const done    = completedByTrainee.get(traineeId) ?? new Set<string>();
    const labs    = labsPerCohort.get(cohortId)    ?? [];
    const kcs     = kcsPerCohort.get(cohortId)     ?? [];
    const cQuizzes = quizzesByCohort.get(cohortId) ?? [];

    const labRatePct = labs.length
      ? (labs.filter((tid) => done.has(tid)).length / labs.length) * 100
      : null;
    const kcRatePct = kcs.length
      ? (kcs.filter((tid) => done.has(tid)).length / kcs.length) * 100
      : null;

    const pcts: number[] = [];
    for (const q of cQuizzes) {
      const best = bestExamScore.get(`${traineeId}:${q.id}`);
      if (best !== undefined) pcts.push((best / q.max_score) * 100);
    }
    const quizAvgPct = pcts.length
      ? pcts.reduce((a, b) => a + b, 0) / pcts.length
      : null;

    return { quizAvgPct, labRatePct, kcRatePct };
  }

  // ── Build training points ────────────────────────────────────────────────────

  const outcomeByTrainee = new Map(
    (historicalOutcomes ?? []).map((o) => [o.trainee_id, o])
  );

  const trainingPoints: TrainingPoint[] = [];

  for (const tid of labelledTraineeIds) {
    const cid    = traineeCohortMap.get(tid);
    const label  = outcomeByTrainee.get(tid);
    if (!cid || !label || label.actual_score === null) continue;

    const { quizAvgPct, labRatePct, kcRatePct } = extractFeatures(tid, cid);
    if (quizAvgPct === null) continue; // no quiz data → skip this point

    trainingPoints.push({
      quizAvgPct,
      labRatePct:  labRatePct  ?? quizAvgPct, // impute missing with quiz avg
      kcRatePct:   kcRatePct   ?? quizAvgPct,
      actualScore: label.actual_score,
      passed:      label.outcome === "passed" ? 1 : 0,
    });
  }

  // ── Fit models ───────────────────────────────────────────────────────────────

  const modelBundle: ModelBundle = fitModels(trainingPoints);

  // ── Current-cohort trainee features (for prediction) ────────────────────────

  const traineeFeatures = traineeIds.map((tid) => {
    const { labRatePct, kcRatePct } = extractFeatures(tid, id);
    return {
      traineeId:  tid,
      labRatePct: labRatePct  ?? null,
      kcRatePct:  kcRatePct   ?? null,
    };
  });

  return (
    <ExamsClient
      cohortId={id}
      cohortLevel={cohortLevel}
      cohortExamType={cohort?.exam_type ?? null}
      trainees={(trainees ?? []).map((t) => ({
        ...t,
        show_readiness: t.show_readiness ?? false,
      }))}
      quizzes={(quizzes ?? []).map((q) => ({
        ...q,
        focus_type:  (q.focus_type  as string) ?? "practitioner",
        focus_label: (q.focus_label as string | null) ?? null,
        max_score:   (q.max_score   as number) ?? 100,
      }))}
      scores={scores   ?? []}
      vouchers={vouchers ?? []}
      pooledVouchers={pooledVouchers ?? []}
      outcomes={outcomes ?? []}
      modelBundle={modelBundle}
      traineeFeatures={traineeFeatures}
    />
  );
}
