import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamsClient from "./ExamsClient";
import { fitModels, type TrainingPoint, type ModelBundle } from "@/lib/regression";

// Allow up to 60 seconds — this page runs multi-round DB queries + regression.
export const maxDuration = 60;

export default async function ExamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Round 1: cohort + trainees + quizzes — all independent
  const [{ data: cohort }, { data: trainees }, { data: quizzes }] = await Promise.all([
    supabase.from("cohorts").select("level, exam_type, analytics_threshold").eq("id", id).single(),
    supabase.from("trainees").select("id, serial_no, full_name, personal_email, amalitech_email, show_readiness, exam_approved").eq("cohort_id", id).is("deleted_at", null).eq("status", "active").order("serial_no", { ascending: true, nullsFirst: false }),
    supabase.from("exam_quizzes").select("id, quiz_name, focus_type, focus_label, week_number, quiz_date, max_score, created_at").eq("cohort_id", id).order("created_at", { ascending: true }),
  ]);

  const traineeIds  = (trainees ?? []).map((t) => t.id);
  const quizIds     = (quizzes  ?? []).map((q) => q.id);
  const cohortLevel = cohort?.level ?? "practitioner";
  const svc         = createServiceClient();

  // Round 2: scores + vouchers + pooled vouchers + outcomes + completion summary
  //          + same-level cohort IDs + exam appointments + exam schedules — all independent
  const [
    [{ data: scores }, { data: vouchers }, { data: pooledVouchers }, { data: outcomes }],
    [{ data: completionSummary }, { data: currentCohortTasks }],
    { data: sameLevelCohorts },
    { data: appointmentsRaw },
    { data: examSchedulesRaw },
  ] = await Promise.all([
    Promise.all([
      quizIds.length
        ? supabase.from("exam_scores").select("id, quiz_id, trainee_id, score, attempt_no, uploaded_at").in("quiz_id", quizIds)
        : Promise.resolve({ data: [] as { id: string; quiz_id: string; trainee_id: string; score: number; attempt_no: number; uploaded_at: string }[] }),
      traineeIds.length
        ? supabase.from("vouchers").select("id, trainee_id, exam_type, issued_date, attempt_no, voucher_code").in("trainee_id", traineeIds).is("revoked_at", null).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; trainee_id: string; exam_type: string; issued_date: string; attempt_no: number; voucher_code: string | null }[] }),
      traineeIds.length
        ? supabase.from("voucher_pool").select("id, trainee_id, voucher_code").eq("cohort_id", id).eq("is_used", false).not("trainee_id", "is", null)
        : Promise.resolve({ data: [] as { id: string; trainee_id: string | null; voucher_code: string }[] }),
      traineeIds.length
        ? supabase.from("exam_outcomes").select("id, trainee_id, exam_type, actual_score, outcome, exam_date, attempt_no, notes, self_reported").in("trainee_id", traineeIds).order("attempt_no", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; trainee_id: string; exam_type: string; actual_score: number | null; outcome: string; exam_date: string | null; attempt_no: number; notes: string | null; self_reported: boolean }[] }),
    ]),
    Promise.all([
      supabase.rpc("get_cohort_completion_summary", { p_cohort_id: id }),
      supabase.from("cohort_week_tasks").select("id, task_type").eq("cohort_id", id),
    ]),
    svc.from("cohorts").select("id").eq("level", cohortLevel),
    traineeIds.length
      ? svc.from("exam_appointments").select("trainee_id, voucher_id, exam_date, exam_time, exam_location").in("trainee_id", traineeIds).order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] as { trainee_id: string; voucher_id: string | null; exam_date: string; exam_time: string; exam_location: string }[] }),
    traineeIds.length
      ? svc.from("exam_schedules").select("id, trainee_id, first_name, last_name, other_names, personal_email, cohort_display_name, region, aws_account_id, aws_cert_email, canvas_grad_status, batch_number, voucher_issued, submitted_at").in("trainee_id", traineeIds)
      : Promise.resolve({ data: [] as { id: string; trainee_id: string; first_name: string; last_name: string; other_names: string | null; personal_email: string; cohort_display_name: string; region: string; aws_account_id: string | null; aws_cert_email: string | null; canvas_grad_status: string; batch_number: number | null; voucher_issued: boolean; submitted_at: string }[] }),
  ]);

  const totalLabTasks = (currentCohortTasks ?? []).filter((t) => t.task_type === "lab").length;
  const totalKcTasks  = (currentCohortTasks ?? []).filter((t) => t.task_type === "kc").length;

  const labPctByTrainee = new Map<string, number>();
  const kcPctByTrainee  = new Map<string, number>();
  for (const row of completionSummary ?? []) {
    const tid = String(row.trainee_id);
    if (totalLabTasks > 0) labPctByTrainee.set(tid, (Number(row.lab_count) / totalLabTasks) * 100);
    if (totalKcTasks  > 0) kcPctByTrainee.set(tid,  (Number(row.kc_count)  / totalKcTasks)  * 100);
  }

  const allCohortIds = (sameLevelCohorts ?? []).map((c) => c.id);

  // ── Regression gate: cheap count before committing to Rounds 3-5 ─────────────
  // Rounds 3-5 fetch data across every same-level cohort (trainees, tasks,
  // completions, exam scores) to train the predictive model.  This is expensive.
  // Skip it entirely unless there are already ≥10 labelled pass/fail outcomes
  // in the system — below that threshold the model is null anyway.
  const MIN_REGRESSION_SAMPLES = 10;
  const { count: labelledCount } = allCohortIds.length
    ? await svc
        .from("exam_outcomes")
        .select("id", { count: "exact", head: true })
        .in("outcome", ["passed", "failed"])
        .eq("attempt_no", 1)
    : { count: 0 };

  const skipRegression = (labelledCount ?? 0) < MIN_REGRESSION_SAMPLES;

  // svc Round 3 — only when we have enough training data
  const allCohortTrainees: { id: string; cohort_id: string }[] = skipRegression ? [] :
    (await svc.from("trainees").select("id, cohort_id").in("cohort_id", allCohortIds).is("deleted_at", null)).data ?? [];

  const allTraineeIds = allCohortTrainees.map((t) => t.id);
  const traineeCohortMap = new Map<string, string>(
    allCohortTrainees.map((t) => [t.id, t.cohort_id])
  );

  // svc Round 4 — only when we have enough training data
  const [historicalOutcomes, allQuizzes, allTasks] = skipRegression
    ? [
        [] as { trainee_id: string; actual_score: number | null; outcome: string; attempt_no: number }[],
        [] as { id: string; cohort_id: string; max_score: number }[],
        [] as { id: string; cohort_id: string; task_type: string }[],
      ]
    : await Promise.all([
        allTraineeIds.length
          ? svc.from("exam_outcomes").select("trainee_id, actual_score, outcome, attempt_no").in("trainee_id", allTraineeIds).in("outcome", ["passed", "failed"]).eq("attempt_no", 1).then((r) => r.data ?? [])
          : Promise.resolve([] as { trainee_id: string; actual_score: number | null; outcome: string; attempt_no: number }[]),
        allCohortIds.length
          ? svc.from("exam_quizzes").select("id, cohort_id, max_score").in("cohort_id", allCohortIds).then((r) => r.data ?? [])
          : Promise.resolve([] as { id: string; cohort_id: string; max_score: number }[]),
        allCohortIds.length
          ? svc.from("cohort_week_tasks").select("id, cohort_id, task_type").in("cohort_id", allCohortIds).then((r) => r.data ?? [])
          : Promise.resolve([] as { id: string; cohort_id: string; task_type: string }[]),
      ]);

  const labelledTraineeIds = [...new Set(historicalOutcomes.map((o) => o.trainee_id))];
  const allQuizIds = allQuizzes.map((q) => q.id);
  const allTaskIds = allTasks.map((t) => t.id);

  // svc Round 5 — only when we have labelled data
  const completionTargetIds = [...new Set([...traineeIds, ...labelledTraineeIds])];
  const [allExamScores, allCompletions] = skipRegression
    ? [
        [] as { trainee_id: string; quiz_id: string; score: number; attempt_no: number }[],
        [] as { trainee_id: string; task_id: string }[],
      ]
    : await Promise.all([
        allQuizIds.length && labelledTraineeIds.length
          ? svc.from("exam_scores").select("trainee_id, quiz_id, score, attempt_no").in("quiz_id", allQuizIds).in("trainee_id", labelledTraineeIds).limit(100000).then((r) => r.data ?? [])
          : Promise.resolve([] as { trainee_id: string; quiz_id: string; score: number; attempt_no: number }[]),
        completionTargetIds.length && allTaskIds.length
          ? svc.from("completions").select("trainee_id, task_id").in("trainee_id", completionTargetIds).in("task_id", allTaskIds).limit(100000).then((r) => r.data ?? [])
          : Promise.resolve([] as { trainee_id: string; task_id: string }[]),
      ]);

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
  // Use the RPC-derived maps instead of extractFeatures to avoid the PostgREST
  // max-rows cap that truncated allCompletions for the current cohort.

  const traineeFeatures = traineeIds.map((tid) => ({
    traineeId:  tid,
    labRatePct: labPctByTrainee.has(tid) ? labPctByTrainee.get(tid)! : (totalLabTasks > 0 ? 0 : null),
    kcRatePct:  kcPctByTrainee.has(tid)  ? kcPctByTrainee.get(tid)!  : (totalKcTasks  > 0 ? 0 : null),
  }));

  return (
    <ExamsClient
      cohortId={id}
      cohortLevel={cohortLevel}
      cohortExamType={cohort?.exam_type ?? null}
      savedThreshold={cohort?.analytics_threshold ?? null}
      trainees={(trainees ?? []).map((t) => ({
        ...t,
        show_readiness: t.show_readiness ?? false,
        exam_approved:  t.exam_approved  ?? false,
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
      appointments={(appointmentsRaw ?? []).map((a) => ({
        traineeId:    a.trainee_id,
        voucherId:    a.voucher_id ?? null,
        examDate:     a.exam_date,
        examTime:     a.exam_time,
        examLocation: a.exam_location,
      }))}
      examSchedules={(examSchedulesRaw ?? []).map((s) => ({
        id:                 s.id,
        traineeId:          s.trainee_id,
        firstName:          s.first_name as string,
        lastName:           s.last_name as string,
        otherNames:         (s.other_names as string | null) ?? null,
        personalEmail:      s.personal_email as string,
        cohortDisplayName:  s.cohort_display_name as string,
        region:             s.region as string,
        awsAccountId:       (s.aws_account_id as string | null) ?? null,
        awsCertEmail:       (s.aws_cert_email as string | null) ?? null,
        canvasGradStatus:   s.canvas_grad_status as string,
        batchNumber:        (s.batch_number as number | null) ?? null,
        voucherIssued:      s.voucher_issued as boolean,
        submittedAt:        s.submitted_at as string,
      }))}
    />
  );
}
