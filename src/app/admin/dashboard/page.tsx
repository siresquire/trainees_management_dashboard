import { createServiceClient } from "@/lib/supabase/server";
import AdminDashboardClient, { type AdminTraineeRow } from "./AdminDashboardClient";

export type SessionInfo = { id: string; cohortId: string; weekNumber: number | null };
export type TaskInfo    = { id: string; cohortId: string; taskType: string; weekNumber: number };
export type QuizInfo    = { id: string; cohortId: string; quizName: string; weekNumber: number; maxScore: number };
export type VoucherRow        = { id: string; traineeId: string; voucherCode: string | null; deadline: string | null; revokedAt: string | null };
export type RevokedVoucherRow = { id: string; traineeId: string; voucherCode: string | null; revokedAt: string; attemptNo: number };
export type ThresholdSettings = { dataBundlePct: number; stipendPct: number; universityMins: number; externalMins: number };
export type CohortWeekTotals  = { labsTotal: number; kcsTotal: number; sessionsTotal: number };

export default async function AdminDashboardPage() {
  const svc = createServiceClient();

  // ── Round 1: active cohorts ────────────────────────────────────────────────
  const { data: cohorts } = await svc
    .from("cohorts")
    .select("id, name, code_name, level, status")
    .eq("status", "active")
    .order("name");

  const cohortIds = (cohorts ?? []).map((c) => c.id);

  // Also load thresholds in parallel
  const { data: settingsRows } = await svc
    .from("admin_settings")
    .select("level, data_bundle_threshold_pct, stipend_threshold_pct, practitioner_university_threshold_mins, practitioner_external_threshold_mins");

  const settingsMap = new Map((settingsRows ?? []).map((r) => [r.level as string, r as Record<string, unknown>]));
  const pr = settingsMap.get("practitioner");
  const as = settingsMap.get("associate");
  const thresholds: Record<string, ThresholdSettings> = {
    practitioner: {
      dataBundlePct:  Number(pr?.data_bundle_threshold_pct ?? 0),
      stipendPct:     Number(pr?.stipend_threshold_pct ?? 0),
      universityMins: Number(pr?.practitioner_university_threshold_mins ?? 45),
      externalMins:   Number(pr?.practitioner_external_threshold_mins   ?? 60),
    },
    associate: {
      dataBundlePct:  Number(as?.data_bundle_threshold_pct ?? 0),
      stipendPct:     Number(as?.stipend_threshold_pct ?? 0),
      universityMins: 45,
      externalMins:   60,
    },
  };

  if (!cohortIds.length) {
    return (
      <AdminDashboardClient
        rows={[]} poolCountPractitioner={0} poolCountAssociate={0}
        allSessions={[]} allTasks={[]} allQuizzes={[]} allVouchers={[]} revokedVouchers={[]}
        thresholds={thresholds}
      />
    );
  }

  // ── Round 2: cohort-level data (all parallel) ──────────────────────────────
  const [
    { data: cohortAccess },
    { data: trainees },
    { data: tasks },
    { data: sessions },
    [{ count: poolCountPractitioner }, { count: poolCountAssociate }],
  ] = await Promise.all([
    svc.from("cohort_access").select("cohort_id, trainer_id").in("cohort_id", cohortIds).eq("role", "owner"),
    svc.from("trainees")
      .select("id, cohort_id, full_name, personal_email, amalitech_email, serial_no, status, exam_approved")
      .in("cohort_id", cohortIds)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("serial_no", { ascending: true, nullsFirst: false }),
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type, week_number").in("cohort_id", cohortIds).limit(100000),
    svc.from("sessions").select("id, cohort_id, week_number").in("cohort_id", cohortIds).limit(100000),
    Promise.all([
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "practitioner").eq("is_used", false),
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "associate").eq("is_used", false),
    ]),
  ]);

  const ownerIdByCohort = new Map<string, string>((cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id]));
  const ownerIds   = [...new Set((cohortAccess ?? []).map((a) => a.trainer_id))];
  const traineeIds = (trainees ?? []).map((t) => t.id);

  // ── Round 3: trainee-level data — all in parallel ─────────────────────────
  // All aggregated data uses SECURITY DEFINER RPCs to bypass the PostgREST
  // max-rows cap (which silently truncates direct SELECT queries at ~1000 rows).
  const [
    { data: profiles },
    { data: completionRows, error: completionErr },
    { data: attendanceRows, error: attendanceErr },
    { data: cohortStatsRows, error: cohortStatsErr },
    { data: wk1to6Rows, error: wk1to6Err },
    { data: vouchersRaw },
    { data: revokedVouchersRaw },
    { data: examQuizzes },
    { data: examScores },
    { data: appointmentsRaw },
    { data: examSchedulesRaw },
  ] = await Promise.all([
    ownerIds.length
      ? svc.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    cohortIds.length
      ? svc.rpc("get_admin_completion_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; lab_count: number; kc_count: number }[], error: null }),
    cohortIds.length
      ? svc.rpc("get_admin_attendance_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; attended_count: number }[], error: null }),
    cohortIds.length
      ? svc.rpc("get_admin_cohort_stats", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { cohort_id: string; lab_total: number; kc_total: number; session_total: number }[], error: null }),
    cohortIds.length
      ? svc.rpc("get_admin_weekly_stats", { p_cohort_ids: cohortIds, p_week_numbers: [1,2,3,4,5,6] })
      : Promise.resolve({ data: [] as { trainee_id: string; lab_count: number; kc_count: number; attended_count: number }[], error: null }),
    traineeIds.length
      ? svc.from("vouchers").select("id, trainee_id, voucher_code, attempt_no, deadline, revoked_at").in("trainee_id", traineeIds).is("revoked_at", null).order("attempt_no", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; trainee_id: string; voucher_code: string | null; attempt_no: number; deadline: string | null; revoked_at: string | null }[] }),
    traineeIds.length
      ? svc.from("vouchers").select("id, trainee_id, voucher_code, attempt_no, revoked_at").in("trainee_id", traineeIds).not("revoked_at", "is", null).order("revoked_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; trainee_id: string; voucher_code: string | null; attempt_no: number; revoked_at: string | null }[] }),
    cohortIds.length
      ? svc.from("exam_quizzes").select("id, cohort_id, quiz_name, week_number, max_score").in("cohort_id", cohortIds).order("week_number", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; cohort_id: string; quiz_name: string; week_number: number; max_score: number }[] }),
    traineeIds.length
      ? svc.from("exam_scores").select("trainee_id, quiz_id, score").in("trainee_id", traineeIds).limit(500000)
      : Promise.resolve({ data: [] as { trainee_id: string; quiz_id: string; score: number }[] }),
    traineeIds.length
      ? svc.from("exam_appointments").select("trainee_id, exam_date, exam_time, exam_location").in("trainee_id", traineeIds).order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] as { trainee_id: string; exam_date: string; exam_time: string; exam_location: string }[] }),
    traineeIds.length
      ? svc.from("exam_schedules").select("id, trainee_id, voucher_issued").in("trainee_id", traineeIds)
      : Promise.resolve({ data: [] as { id: string; trainee_id: string; voucher_issued: boolean }[] }),
  ]);

  if (completionErr)  console.error("[AdminDashboard] get_admin_completion_summary failed:", completionErr.message);
  if (attendanceErr)  console.error("[AdminDashboard] get_admin_attendance_summary failed:", attendanceErr.message);
  if (cohortStatsErr) console.error("[AdminDashboard] get_admin_cohort_stats failed:", cohortStatsErr.message);
  if (wk1to6Err)      console.error("[AdminDashboard] get_admin_weekly_stats (wk1-6) failed:", wk1to6Err.message);

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Task and session totals per cohort — SECURITY DEFINER RPC bypasses PostgREST row cap.
  // cohortStatsRows uses UNION ALL so a cohort_id can appear twice (once for tasks, once for
  // sessions); accumulate rather than overwrite.
  const labTotalByCohort = new Map<string, number>();
  const kcTotalByCohort  = new Map<string, number>();
  const sessionsByCohort = new Map<string, number>();
  for (const stat of cohortStatsRows ?? []) {
    const cid = String(stat.cohort_id);
    labTotalByCohort.set(cid, (labTotalByCohort.get(cid) ?? 0) + Number(stat.lab_total));
    kcTotalByCohort.set(cid,  (kcTotalByCohort.get(cid)  ?? 0) + Number(stat.kc_total));
    sessionsByCohort.set(cid, (sessionsByCohort.get(cid) ?? 0) + Number(stat.session_total));
  }

  // Per-trainee totals from RPCs — one row per trainee, no week breakdown.
  const labsDoneByTrainee         = new Map<string, number>();
  const kcsDoneByTrainee          = new Map<string, number>();
  const sessionsAttendedByTrainee = new Map<string, number>();

  for (const row of completionRows ?? []) {
    const tid = String(row.trainee_id);
    labsDoneByTrainee.set(tid, (labsDoneByTrainee.get(tid) ?? 0) + Number(row.lab_count));
    kcsDoneByTrainee.set(tid,  (kcsDoneByTrainee.get(tid)  ?? 0) + Number(row.kc_count));
  }
  for (const row of attendanceRows ?? []) {
    const tid = String(row.trainee_id);
    sessionsAttendedByTrainee.set(tid, (sessionsAttendedByTrainee.get(tid) ?? 0) + Number(row.attended_count));
  }

  // Weeks 1-6 done counts per trainee (for stipend eligibility — fixed window, not user-filtered)
  const wk1to6LabsDoneByTrainee      = new Map<string, number>();
  const wk1to6KcsDoneByTrainee       = new Map<string, number>();
  const wk1to6AttendedByTrainee      = new Map<string, number>();
  for (const row of wk1to6Rows ?? []) {
    const tid = String(row.trainee_id);
    wk1to6LabsDoneByTrainee.set(tid, Number(row.lab_count));
    wk1to6KcsDoneByTrainee.set(tid,  Number(row.kc_count));
    wk1to6AttendedByTrainee.set(tid, Number(row.attended_count));
  }

  // Weeks 1-6 totals per cohort (denominator for stipend eligibility)
  const wk1to6LabsTotalByCohort      = new Map<string, number>();
  const wk1to6KcsTotalByCohort       = new Map<string, number>();
  const wk1to6SessionsTotalByCohort  = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.week_number < 1 || t.week_number > 6) continue;
    const cid = t.cohort_id;
    if (t.task_type === "lab") wk1to6LabsTotalByCohort.set(cid, (wk1to6LabsTotalByCohort.get(cid) ?? 0) + 1);
    if (t.task_type === "kc")  wk1to6KcsTotalByCohort.set(cid,  (wk1to6KcsTotalByCohort.get(cid)  ?? 0) + 1);
  }
  for (const s of sessions ?? []) {
    if (s.week_number == null || s.week_number < 1 || s.week_number > 6) continue;
    const cid = s.cohort_id;
    wk1to6SessionsTotalByCohort.set(cid, (wk1to6SessionsTotalByCohort.get(cid) ?? 0) + 1);
  }

  // Vouchers — latest non-revoked per trainee
  const voucherByTrainee = new Map<string, { code: string | null; id: string; deadline: string | null }>();
  for (const v of vouchersRaw ?? []) {
    if (!voucherByTrainee.has(v.trainee_id)) {
      voucherByTrainee.set(v.trainee_id, { code: v.voucher_code ?? null, id: v.id, deadline: (v.deadline as string | null) ?? null });
    }
  }

  // Appointments — latest per trainee
  const appointmentByTrainee = new Map<string, { examDate: string; examTime: string; examLocation: string }>();
  for (const a of appointmentsRaw ?? []) {
    if (!appointmentByTrainee.has(a.trainee_id)) {
      appointmentByTrainee.set(a.trainee_id, { examDate: a.exam_date, examTime: a.exam_time, examLocation: a.exam_location });
    }
  }

  // Best quiz scores
  const bestQuizScore = new Map<string, number>();
  for (const s of examScores ?? []) {
    const key  = `${s.trainee_id}:${s.quiz_id}`;
    const prev = bestQuizScore.get(key);
    if (prev === undefined || s.score > prev) bestQuizScore.set(key, s.score);
  }

  const quizzesByCohort = new Map<string, { id: string; quiz_name: string; week_number: number; max_score: number }[]>();
  for (const q of examQuizzes ?? []) {
    const arr = quizzesByCohort.get(q.cohort_id) ?? [];
    arr.push(q);
    quizzesByCohort.set(q.cohort_id, arr);
  }

  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id, c]));

  // Exam schedules — voucher_issued status per trainee
  const scheduleByTrainee = new Map<string, { id: string; voucherIssued: boolean }>();
  for (const s of examSchedulesRaw ?? []) {
    scheduleByTrainee.set(s.trainee_id, { id: s.id, voucherIssued: s.voucher_issued as boolean });
  }

  // ── Build rows ─────────────────────────────────────────────────────────────
  const rows: AdminTraineeRow[] = (trainees ?? []).map((t) => {
    const cohort        = cohortMap.get(t.cohort_id);
    const ownerId       = ownerIdByCohort.get(t.cohort_id);
    const cohortQuizzes = quizzesByCohort.get(t.cohort_id) ?? [];
    const vEntry        = voucherByTrainee.get(t.id);
    const sEntry        = scheduleByTrainee.get(t.id);

    const labsDone        = labsDoneByTrainee.get(t.id) ?? 0;
    const kcsDone         = kcsDoneByTrainee.get(t.id) ?? 0;
    const sessionsAttended = sessionsAttendedByTrainee.get(t.id) ?? 0;

    return {
      traineeId:        t.id,
      serialNo:         t.serial_no,
      fullName:         t.full_name,
      personalEmail:    t.personal_email,
      amalitechEmail:   t.amalitech_email,
      status:           t.status,
      examApproved:     t.exam_approved ?? false,
      labsDone,
      labsTotal:        labTotalByCohort.get(t.cohort_id) ?? 0,
      kcsDone,
      kcsTotal:         kcTotalByCohort.get(t.cohort_id) ?? 0,
      sessionsAttended,
      sessionsTotal:    sessionsByCohort.get(t.cohort_id) ?? 0,
      wk1to6LabsDone:         wk1to6LabsDoneByTrainee.get(t.id)     ?? 0,
      wk1to6KcsDone:          wk1to6KcsDoneByTrainee.get(t.id)      ?? 0,
      wk1to6SessionsAttended: wk1to6AttendedByTrainee.get(t.id)     ?? 0,
      wk1to6LabsTotal:        wk1to6LabsTotalByCohort.get(t.cohort_id)     ?? 0,
      wk1to6KcsTotal:         wk1to6KcsTotalByCohort.get(t.cohort_id)      ?? 0,
      wk1to6SessionsTotal:    wk1to6SessionsTotalByCohort.get(t.cohort_id) ?? 0,
      cohortId:         t.cohort_id,
      cohortCode:       cohort?.code_name ?? cohort?.name ?? "—",
      cohortLevel:      cohort?.level ?? "practitioner",
      trainerName:      ownerId ? (profileNameById.get(ownerId) ?? "—") : "—",
      issuedVoucher:    vEntry?.code ?? null,
      issuedVoucherId:  vEntry?.id   ?? null,
      voucherDeadline:  vEntry?.deadline ?? null,
      examAppointment:  appointmentByTrainee.get(t.id) ?? null,
      scheduleId:          sEntry?.id           ?? null,
      scheduleVoucherIssued: sEntry?.voucherIssued ?? false,
      weeklyStats:      [],
      quizScores:       cohortQuizzes
        .map((q) => ({ quizId: q.id, score: bestQuizScore.get(`${t.id}:${q.id}`) ?? null }))
        .filter((qs): qs is { quizId: string; score: number } => qs.score !== null),
    };
  });

  rows.sort((a, b) => {
    const t = a.trainerName.localeCompare(b.trainerName);
    if (t !== 0) return t;
    const c = a.cohortCode.localeCompare(b.cohortCode);
    if (c !== 0) return c;
    return (a.serialNo ?? 9999) - (b.serialNo ?? 9999);
  });

  const allSessions: SessionInfo[] = (sessions ?? []).map((s) => ({
    id: s.id, cohortId: s.cohort_id, weekNumber: s.week_number,
  }));
  const allTasks: TaskInfo[] = (tasks ?? []).map((t) => ({
    id: t.id, cohortId: t.cohort_id, taskType: t.task_type, weekNumber: t.week_number,
  }));
  const allQuizzes: QuizInfo[] = (examQuizzes ?? []).map((q) => ({
    id: q.id, cohortId: q.cohort_id, quizName: q.quiz_name, weekNumber: q.week_number, maxScore: q.max_score,
  }));
  const allVouchers: VoucherRow[] = (vouchersRaw ?? []).map((v) => ({
    id: v.id, traineeId: v.trainee_id, voucherCode: v.voucher_code ?? null,
    deadline: (v.deadline as string | null) ?? null, revokedAt: (v.revoked_at as string | null) ?? null,
  }));
  const revokedVouchers: RevokedVoucherRow[] = (revokedVouchersRaw ?? []).map((v) => ({
    id: v.id, traineeId: v.trainee_id, voucherCode: v.voucher_code ?? null,
    revokedAt: v.revoked_at as string, attemptNo: v.attempt_no as number,
  }));

  return (
    <AdminDashboardClient
      rows={rows}
      poolCountPractitioner={poolCountPractitioner ?? 0}
      poolCountAssociate={poolCountAssociate ?? 0}
      allSessions={allSessions}
      allTasks={allTasks}
      allQuizzes={allQuizzes}
      allVouchers={allVouchers}
      revokedVouchers={revokedVouchers}
      thresholds={thresholds}
    />
  );
}
