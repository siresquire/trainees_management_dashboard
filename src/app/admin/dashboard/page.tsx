import { createServiceClient } from "@/lib/supabase/server";
import AdminDashboardClient, { type AdminTraineeRow } from "./AdminDashboardClient";

export type SessionInfo = { id: string; cohortId: string; weekNumber: number | null };
export type TaskInfo    = { id: string; cohortId: string; taskType: string; weekNumber: number };
export type QuizInfo    = { id: string; cohortId: string; quizName: string; weekNumber: number; maxScore: number };
export type VoucherRow        = { id: string; traineeId: string; voucherCode: string | null; deadline: string | null; revokedAt: string | null };
export type RevokedVoucherRow = { id: string; traineeId: string; voucherCode: string | null; revokedAt: string; attemptNo: number };
export type ThresholdSettings = { dataBundlePct: number; stipendPct: number };

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
    .select("level, data_bundle_threshold_pct, stipend_threshold_pct");

  const settingsMap = new Map((settingsRows ?? []).map((r) => [r.level as string, r]));
  const thresholds: Record<string, ThresholdSettings> = {
    practitioner: { dataBundlePct: Number(settingsMap.get("practitioner")?.data_bundle_threshold_pct ?? 0), stipendPct: Number(settingsMap.get("practitioner")?.stipend_threshold_pct ?? 0) },
    associate:    { dataBundlePct: Number(settingsMap.get("associate")?.data_bundle_threshold_pct    ?? 0), stipendPct: Number(settingsMap.get("associate")?.stipend_threshold_pct    ?? 0) },
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
    svc.from("cohort_week_tasks").select("id, cohort_id, task_type, week_number").in("cohort_id", cohortIds),
    svc.from("sessions").select("id, cohort_id, week_number").in("cohort_id", cohortIds),
    Promise.all([
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "practitioner").eq("is_used", false),
      svc.from("admin_voucher_pool").select("id", { count: "exact", head: true }).eq("level", "associate").eq("is_used", false),
    ]),
  ]);

  const ownerIdByCohort = new Map<string, string>((cohortAccess ?? []).map((a) => [a.cohort_id, a.trainer_id]));
  const ownerIds   = [...new Set((cohortAccess ?? []).map((a) => a.trainer_id))];
  const traineeIds = (trainees ?? []).map((t) => t.id);

  // ── Round 3: trainee-level data — all in parallel ─────────────────────────
  // Completion and attendance use SECURITY DEFINER RPCs to bypass PostgREST
  // max-rows cap (which silently truncates direct SELECT queries at ~1000 rows).
  const [
    { data: profiles },
    { data: completionRows, error: completionErr },
    { data: attendanceRows, error: attendanceErr },
    { data: vouchersRaw },
    { data: revokedVouchersRaw },
    { data: examQuizzes },
    { data: examScores },
    { data: appointmentsRaw },
  ] = await Promise.all([
    ownerIds.length
      ? svc.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    cohortIds.length
      ? svc.rpc("get_admin_completion_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; week_number: number; lab_count: number; kc_count: number }[], error: null }),
    cohortIds.length
      ? svc.rpc("get_admin_attendance_summary", { p_cohort_ids: cohortIds })
      : Promise.resolve({ data: [] as { trainee_id: string; cohort_id: string; week_number: number | null; attended_count: number }[], error: null }),
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
  ]);

  if (completionErr) console.error("[AdminDashboard] get_admin_completion_summary failed — run supabase db push:", completionErr.message);
  if (attendanceErr) console.error("[AdminDashboard] get_admin_attendance_summary failed — run supabase db push:", attendanceErr.message);

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Task totals per cohort
  const labTotalByCohort = new Map<string, number>();
  const kcTotalByCohort  = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.task_type === "lab") labTotalByCohort.set(t.cohort_id, (labTotalByCohort.get(t.cohort_id) ?? 0) + 1);
    if (t.task_type === "kc")  kcTotalByCohort.set(t.cohort_id,  (kcTotalByCohort.get(t.cohort_id)  ?? 0) + 1);
  }

  const sessionsByCohort = new Map<string, number>();
  for (const s of sessions ?? []) {
    sessionsByCohort.set(s.cohort_id, (sessionsByCohort.get(s.cohort_id) ?? 0) + 1);
  }

  // Per-trainee weekly stats from RPCs
  type WeekBucket = { labs: number; kcs: number; sessions: number };
  const weeklyByTrainee = new Map<string, Map<string, WeekBucket>>();

  for (const row of completionRows ?? []) {
    const tid = String(row.trainee_id);
    const key = String(row.week_number);
    const traineeMap = weeklyByTrainee.get(tid) ?? new Map<string, WeekBucket>();
    const bucket = traineeMap.get(key) ?? { labs: 0, kcs: 0, sessions: 0 };
    bucket.labs += Number(row.lab_count);
    bucket.kcs  += Number(row.kc_count);
    traineeMap.set(key, bucket);
    weeklyByTrainee.set(tid, traineeMap);
  }

  for (const row of attendanceRows ?? []) {
    const tid = String(row.trainee_id);
    const key = row.week_number !== null ? String(row.week_number) : "__null__";
    const traineeMap = weeklyByTrainee.get(tid) ?? new Map<string, WeekBucket>();
    const bucket = traineeMap.get(key) ?? { labs: 0, kcs: 0, sessions: 0 };
    bucket.sessions += Number(row.attended_count);
    traineeMap.set(key, bucket);
    weeklyByTrainee.set(tid, traineeMap);
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

  // ── Build rows ─────────────────────────────────────────────────────────────
  const rows: AdminTraineeRow[] = (trainees ?? []).map((t) => {
    const cohort        = cohortMap.get(t.cohort_id);
    const ownerId       = ownerIdByCohort.get(t.cohort_id);
    const traineeWeeks  = weeklyByTrainee.get(t.id);
    const cohortQuizzes = quizzesByCohort.get(t.cohort_id) ?? [];
    const vEntry        = voucherByTrainee.get(t.id);

    const weeklyStats: AdminTraineeRow["weeklyStats"] = [];
    let labsDone = 0, kcsDone = 0, sessionsAttended = 0;

    if (traineeWeeks) {
      for (const [key, bucket] of traineeWeeks) {
        const weekNumber = key === "__null__" ? null : Number(key);
        weeklyStats.push({ weekNumber, labsDone: bucket.labs, kcsDone: bucket.kcs, sessionsAttended: bucket.sessions });
        labsDone        += bucket.labs;
        kcsDone         += bucket.kcs;
        sessionsAttended += bucket.sessions;
      }
    }

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
      cohortId:         t.cohort_id,
      cohortCode:       cohort?.code_name ?? cohort?.name ?? "—",
      cohortLevel:      cohort?.level ?? "practitioner",
      trainerName:      ownerId ? (profileNameById.get(ownerId) ?? "—") : "—",
      issuedVoucher:    vEntry?.code ?? null,
      issuedVoucherId:  vEntry?.id   ?? null,
      voucherDeadline:  vEntry?.deadline ?? null,
      examAppointment:  appointmentByTrainee.get(t.id) ?? null,
      weeklyStats,
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
